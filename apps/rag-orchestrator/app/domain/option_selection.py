"""Recorte de las opciones validadas a `maxOptions` (FR-09, RN-28): regla pura, sin E/S.

Con aplicabilidad calculada (US-125) las opciones se ordenan con el comparador de RN-28 sobre su fuente más aplicable:
menos excluyentes en No coincide, más Coincide y, solo a igualdad de conteos, ``relevance_score`` descendente (RN-03) y
``chunkId`` de la cita principal ascendente. Sin aplicabilidad la clave se reduce a esas dos últimas (regla del S1). Es
un orden total y determinista, independiente del orden en que el generador emitió las opciones, y nunca un puntaje
combinado. El excedente se omite: no es una opción descartada.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

from app.domain.applicability_aggregation import AplicabilidadDeOpcion
from app.domain.applicability_order import clave_de_aplicabilidad
from app.domain.citations import OpcionAceptada


@dataclass(frozen=True)
class OpcionConRelevancia:
    """Una opción con sus citas ya validadas, su relevancia (RN-03) y su cita principal."""

    aceptada: OpcionAceptada
    relevance_score: float
    chunk_principal_id: str
    aplicabilidad: AplicabilidadDeOpcion | None = None
    """La agregada por fuente (ADR-31); ``None`` si la consulta no calculó aplicabilidad."""


@dataclass(frozen=True)
class RecorteDeOpciones:
    """Las opciones conservadas en orden y SOLO el número de las que quedaron fuera (nunca su contenido)."""

    conservadas: tuple[OpcionConRelevancia, ...]
    excedente: int


def recortar_a_max_opciones(
    opciones: Sequence[OpcionConRelevancia], max_options: int
) -> tuple[OpcionConRelevancia, ...]:
    """Las ``max_options`` primeras en el orden determinista de RN-28."""
    return tuple(sorted(opciones, key=_clave_de_recorte)[:max_options])


def recortar_contando_excedente(
    opciones: Sequence[OpcionConRelevancia], max_options: int
) -> RecorteDeOpciones:
    """El recorte de RN-28 y cuántas opciones validadas quedaron fuera (``optionsNotShown``, US-134 AC-3)."""
    conservadas = recortar_a_max_opciones(opciones, max_options)
    return RecorteDeOpciones(conservadas, len(opciones) - len(conservadas))


def _clave_de_recorte(opcion: OpcionConRelevancia) -> tuple[int, int, float, str]:
    """Sin aplicabilidad no hay conteos que ordenen: la clave queda en relevancia y ``chunkId`` (regla del S1)."""
    excluyentes, coincide = 0, 0
    if opcion.aplicabilidad is not None and opcion.aplicabilidad.por_fuente:
        mas_aplicable = opcion.aplicabilidad.por_fuente[0]
        excluyentes, coincide = (
            mas_aplicable.excluyentes_no_coincide,
            mas_aplicable.resumen.coincide,
        )
    return clave_de_aplicabilidad(
        excluyentes, coincide, opcion.relevance_score, opcion.chunk_principal_id
    )
