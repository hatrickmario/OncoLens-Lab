"""Métricas puras de la familia `aplicabilidad` (US-132): concordancia de estados, M-08.2 y M-08.6, sin E/S."""

from __future__ import annotations

from collections.abc import Collection, Mapping, Sequence
from dataclasses import dataclass

from app.domain.aplicabilidad_tipos import ContextoDelPaciente, CriterioEvaluado
from app.domain.applicability_rules import DestinoNoResoluble, valor_del_paciente
from app.domain.criterios_aplicabilidad import CriterioDeAplicabilidad

METRICA_COINCIDE_SIN_CITA = "criterios_coincide_sin_cita"
METRICA_VALORES_NO_COPIADOS = "valores_paciente_no_copiados"


@dataclass(frozen=True)
class Esperado:
    """Lo que un humano espera de un criterio: su estado y, si es ``desconocido`` con causa en el contrato, la causa."""

    estado: str
    causa: str | None = None


@dataclass(frozen=True)
class Concordancia:
    aciertos: int
    total: int


@dataclass(frozen=True)
class ParEvaluado:
    """Un par paciente-fuente evaluado: lo esperado, lo obtenido y lo necesario para medir M-08.2 y M-08.6."""

    id: str
    esperados: Mapping[str, Esperado]
    criterios: tuple[CriterioEvaluado, ...]
    contexto: ContextoDelPaciente
    chunk_ids_de_la_fuente: frozenset[str]
    catalogo: Mapping[str, CriterioDeAplicabilidad]
    omitidas: int = 0


def concordancia_de_estados(
    esperados: Mapping[str, Esperado], obtenidos: Sequence[CriterioEvaluado]
) -> Concordancia:
    """Criterios con el estado (y la causa, si el contrato la lleva) esperados; un criterio ausente cuenta como fallo."""
    por_clave = {c.clave: c for c in obtenidos}
    aciertos = sum(
        1
        for clave, esperado in esperados.items()
        if (c := por_clave.get(clave)) is not None
        and (c.estado, c.causa) == (esperado.estado, esperado.causa)
    )
    return Concordancia(aciertos, len(esperados))


def coincide_sin_cita(
    criterios: Sequence[CriterioEvaluado], chunk_ids_de_la_fuente: Collection[str]
) -> int:
    """M-08.2 (RN-01): criterios en ``coincide`` cuya cita no es un chunk de su fuente en esta consulta.

    Un criterio estructurado cita el mejor chunk de la fuente (``chunk_citado_id`` ausente); uno textual, el chunk que
    el NLI validó. Sin chunks en la fuente, o sin valor del estudio, un ``coincide`` no tiene en qué apoyarse."""
    return sum(
        1
        for c in criterios
        if c.estado == "coincide"
        and (
            not chunk_ids_de_la_fuente
            or c.valor_estudio is None
            or (c.chunk_citado_id is not None and c.chunk_citado_id not in chunk_ids_de_la_fuente)
        )
    )


def valores_no_copiados(
    criterios: Sequence[CriterioEvaluado],
    contexto: ContextoDelPaciente,
    catalogo: Mapping[str, CriterioDeAplicabilidad],
) -> int:
    """M-08.6 (ADR-34): criterios cuyo ``patientValue`` no es la copia literal del contexto enviado.

    Un criterio que el catálogo no declara no se puede verificar y cuenta como no copiado."""
    return sum(1 for c in criterios if not _es_copia_del_contexto(c, contexto, catalogo))


def _es_copia_del_contexto(
    criterio: CriterioEvaluado,
    contexto: ContextoDelPaciente,
    catalogo: Mapping[str, CriterioDeAplicabilidad],
) -> bool:
    del_catalogo = catalogo.get(criterio.clave)
    if del_catalogo is None:
        return False
    if criterio.clave in contexto.datos_criticos_faltantes:
        return (
            criterio.valor_paciente is None
        )  # el checklist declara que falta: no se compara un valor desmentido
    try:
        return criterio.valor_paciente == valor_del_paciente(contexto, del_catalogo.destino)
    except DestinoNoResoluble:
        return criterio.valor_paciente is None


def veredicto_de_invariantes(sin_cita: int, no_copiados: int) -> list[str]:
    """Nombres de las métricas-invariante (PRD §18) que valen más que cero."""
    violadas = {
        METRICA_COINCIDE_SIN_CITA: sin_cita,
        METRICA_VALORES_NO_COPIADOS: no_copiados,
    }
    return [nombre for nombre, valor in violadas.items() if valor > 0]


def marca_frente_a_meta(valor: float | None, minimo: float) -> str:
    """``en_meta`` / ``fuera_de_meta``; ``None`` (no medida) no se disfraza de 0,0."""
    if valor is None:
        return "no_medida"
    return "en_meta" if valor >= minimo else "fuera_de_meta"
