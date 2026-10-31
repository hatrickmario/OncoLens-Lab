"""Reglas puras por valor de la extracción de población en abanico (US-242, ADR-47, D4): qué valor propuesto por el LLM
sobrevive. Sin E/S, sin reloj ni aleatoriedad.

Orden de la depuración (lo decide ``PopulationFanoutExtractor``): relleno → fragmento → longitud → lenguaje → NLI. Cada
regla devuelve lo que se conserva y cuántos descartó: el contador es del resumen, el valor nunca sale de aquí (RN-14).
"""

from __future__ import annotations

from collections.abc import Callable, Collection, Mapping, Sequence
from dataclasses import dataclass, replace
from typing import Final

from app.domain.aplicabilidad_tipos import AlcanceDeValor
from app.domain.corpus_metadata.campos import LONGITUD_MAXIMA_DE_VALOR
from app.domain.lenguaje import normalizar_texto
from app.domain.nli import ParNli, ResultadoNli
from app.domain.support import soporta

# Marcadores que un LLM escribe cuando no encuentra el dato (ya normalizados: minúsculas, sin puntuación).
MARCADORES_DE_RELLENO: Final = frozenset(
    {
        "not found",
        "not reported",
        "not stated",
        "not available",
        "not specified",
        "none",
        "null",
        "n a",
        "unknown",
        "no expresado",
        "no reportado",
        "no disponible",
        "no especificado",
        "desconocido",
        "ninguno",
    }
)


@dataclass(frozen=True)
class ValorPropuesto:
    """Un valor que el LLM propone para un criterio, con el fragmento que dice contenerlo.

    ``resultado_nli`` queda ``None`` hasta que el NLI lo confirma (``verificar_nli``)."""

    valor: str
    chunk_id: str
    alcance: AlcanceDeValor
    resultado_nli: str | None = None


@dataclass(frozen=True)
class Depurado:
    """Lo que una regla conserva y cuántos valores descartó."""

    conservados: tuple[ValorPropuesto, ...]
    descartados: int


def rechazar_relleno(propuestos: Sequence[ValorPropuesto]) -> Depurado:
    """Descarta «not found», «no expresado», ``none``… (RN-04): un marcador de ausencia no es un valor."""
    return _depurar(propuestos, lambda v: normalizar_texto(v.valor) not in MARCADORES_DE_RELLENO)


def descartar_chunk_ajeno(
    propuestos: Sequence[ValorPropuesto], chunk_ids_del_documento: Collection[str]
) -> Depurado:
    """Descarta el valor cuyo ``chunkId`` no existe en el documento de la tarea (RN-04): la fuente la fija el código.

    Se valida contra TODOS los fragmentos del documento, no solo los del prompt. Cuenta en ``valoresRechazados`` (motivo
    ``chunk_ajeno``) junto con el relleno: AC-2 fija que ``valoresRechazados`` solo suma esos dos motivos."""
    return _depurar(propuestos, lambda v: v.chunk_id in chunk_ids_del_documento)


def descartar_por_longitud(propuestos: Sequence[ValorPropuesto]) -> Depurado:
    """Descarta el valor de más de ``LONGITUD_MAXIMA_DE_VALOR`` caracteres (``maxLength`` del contrato, D12).

    No se recorta: un valor recortado ya no es el que el NLI verificó."""
    return _depurar(propuestos, lambda v: len(v.valor) <= LONGITUD_MAXIMA_DE_VALOR)


def omitir_lenguaje_prescriptivo(
    propuestos: Sequence[ValorPropuesto], reglas_que_incumple: Callable[[str], Sequence[str]]
) -> Depurado:
    """Descarta el valor con un término prohibido (RN-23, D9). Se omite, nunca se sustituye por otro texto."""
    return _depurar(propuestos, lambda v: not reglas_que_incumple(v.valor))


def hipotesis_de_valor(etiqueta_del_criterio: str, valor: str) -> str:
    """Verbalización determinista del valor como hipótesis para el NLI (ADR-34): describe lo que el estudio declara."""
    return f"En la población del estudio, {etiqueta_del_criterio}: {valor}"


def verificar_nli(
    propuestos: Sequence[ValorPropuesto], resultados: Sequence[ResultadoNli], umbral: float
) -> Depurado:
    """Conserva el valor cuyo par (fragmento citado, hipótesis) ``soporta()`` con ``umbral`` (RN-01) y anota su etiqueta.

    ``resultados`` trae un resultado por valor, en el mismo orden."""
    if len(resultados) != len(propuestos):
        raise ValueError("el NLI debe devolver un resultado por valor")
    verificados = tuple(
        replace(valor, resultado_nli=resultado.label)
        for valor, resultado in zip(propuestos, resultados, strict=True)
        if soporta(resultado, umbral)
    )
    return Depurado(verificados, len(propuestos) - len(verificados))


def pares_de_verificacion(
    propuestos: Sequence[ValorPropuesto],
    texto_del_fragmento: Mapping[str, str],
    etiqueta_del_criterio: str,
) -> list[ParNli]:
    """Un par (fragmento que el valor cita, hipótesis) por valor, en el mismo orden: el soporte es contra SU fragmento."""
    return [
        ParNli(texto_del_fragmento[v.chunk_id], hipotesis_de_valor(etiqueta_del_criterio, v.valor))
        for v in propuestos
    ]


def _depurar(
    propuestos: Sequence[ValorPropuesto], conservar: Callable[[ValorPropuesto], bool]
) -> Depurado:
    conservados = tuple(v for v in propuestos if conservar(v))
    return Depurado(conservados, len(propuestos) - len(conservados))
