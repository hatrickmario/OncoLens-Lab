"""Reglas puras de la comparación de las variantes de contexto del chunk (US-279 AC-5, ADR-45 P6): sin E/S ni reloj.

Un brazo es una variante de ``CORPUS_CHUNK_CONTEXT`` con su propio índice; la referencia es ``ninguno`` y se mide en la misma corrida,
de modo que la diferencia solo se atribuye al contexto. ``None`` significa «no medible» y NUNCA se trata como ``0.0``. El informe evalúa
la regla de adopción y no cambia ningún valor por defecto: adoptar es una decisión del usuario sobre el reporte versionado.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from statistics import mean
from typing import Final

from app.domain.corpus_seed.contexto_del_chunk import VarianteDeContexto
from app.evaluation.retrieval_metrics import bootstrap_ic
from app.evaluation.viabilidad_del_brazo import exceso_de_latencia

VARIANTE_DE_REFERENCIA: Final = VarianteDeContexto.NINGUNO
CLAVE_DE_LA_VARIANTE: Final = "CORPUS_CHUNK_CONTEXT"
METRICA_DE_ADOPCION: Final = "recall_at_10_total"
"""La métrica cuya mejora decide la regla (recall@10 sobre todas las preguntas con respuesta); el MRR se informa, no decide."""

MOTIVO_SIN_MEJORA: Final = "sin_mejora"
MOTIVO_P95_SOBRE_EL_TOPE: Final = "p95_sobre_el_tope"
MOTIVO_NO_MEDIBLE: Final = "no_medible"
MOTIVOS_DE_NO_CUMPLIR: Final = frozenset(
    {MOTIVO_SIN_MEJORA, MOTIVO_P95_SOBRE_EL_TOPE, MOTIVO_NO_MEDIBLE}
)
"""Los motivos posibles: el esquema del informe los toma de aquí, no los repite."""


def error_de_los_brazos(
    variantes: Sequence[tuple[str, VarianteDeContexto | None]],
) -> str | None:
    """El motivo por el que los brazos no son una comparación de contexto válida, o ``None`` si lo son (o si ninguno declara variante).

    Todos declaran ``CORPUS_CHUNK_CONTEXT``, no hay dos con la misma y el primero (la referencia) es ``ninguno``."""
    declaradas = [variante for _, variante in variantes]
    if all(v is None for v in declaradas):
        return None
    if any(v is None for v in declaradas):
        return f"si un brazo declara {CLAVE_DE_LA_VARIANTE}, todos los brazos deben declararla"
    if len(set(declaradas)) != len(declaradas):
        return f"dos brazos declaran la misma variante de {CLAVE_DE_LA_VARIANTE}"
    if declaradas[0] is not VARIANTE_DE_REFERENCIA:
        return f"el primer brazo (la referencia) debe declarar {CLAVE_DE_LA_VARIANTE}: {VARIANTE_DE_REFERENCIA.value}"
    return None


@dataclass(frozen=True)
class DiferenciaPareada:
    """Brazo menos referencia sobre las mismas preguntas, con su IC 95 % por bootstrap; todo ``None`` si no hay preguntas pareadas."""

    diferencia: float | None
    inferior: float | None
    superior: float | None


def diferencia_pareada(
    brazo: Mapping[str, float | None],
    referencia: Mapping[str, float | None],
    *,
    semilla: int,
    repeticiones: int,
) -> DiferenciaPareada:
    """La media de las diferencias por pregunta y su intervalo; solo cuentan las preguntas medidas en los dos brazos."""
    diferencias = [
        valor - referencia[pregunta]  # type: ignore[operator]
        for pregunta, valor in brazo.items()
        if valor is not None and referencia.get(pregunta) is not None
    ]
    if not diferencias:
        return DiferenciaPareada(None, None, None)
    inferior, superior = bootstrap_ic(diferencias, semilla, repeticiones)
    return DiferenciaPareada(mean(diferencias), inferior, superior)


@dataclass(frozen=True)
class ReglaDeAdopcion:
    """``mejora_fuera_del_ruido`` ``None`` = lo medido no alcanza para afirmarlo (ni «cumple» ni «no cumple»)."""

    mejora_fuera_del_ruido: bool | None
    motivos: tuple[str, ...]


def regla_de_adopcion(
    *, inferior: float | None, p95_consulta_s: float | None, tope_p95_s: float
) -> ReglaDeAdopcion:
    """Cumple si la mejora excluye 0 en el IC pareado (el extremo inferior es positivo) Y el p95 de consulta completa no supera el
    tope ``p95_evidence_analyses_s`` de las metas (RN-22). Sin una de las dos mediciones no se marca ninguna de las dos cosas."""
    if inferior is None or p95_consulta_s is None:
        return ReglaDeAdopcion(None, (MOTIVO_NO_MEDIBLE,))
    motivos = tuple(
        motivo
        for motivo, falla in (
            (MOTIVO_SIN_MEJORA, inferior <= 0.0),
            (MOTIVO_P95_SOBRE_EL_TOPE, exceso_de_latencia(p95_consulta_s, tope_p95_s)),
        )
        if falla
    )
    return ReglaDeAdopcion(not motivos, motivos)
