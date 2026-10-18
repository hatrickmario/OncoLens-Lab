"""Recorte de las opciones validadas a `maxOptions` (FR-09, RN-28): regla pura, sin E/S.

Hasta que exista la aplicabilidad (S5, US-125) las opciones se ordenan por ``relevance_score`` descendente y, a
igualdad, por ``chunkId`` de la cita principal ascendente: orden total y determinista, independiente del orden en
que el generador las emitió. El excedente se omite: no es una opción descartada.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

from app.domain.citations import OpcionAceptada


@dataclass(frozen=True)
class OpcionConRelevancia:
    """Una opción con sus citas ya validadas, su relevancia (RN-03) y su cita principal."""

    aceptada: OpcionAceptada
    relevance_score: float
    chunk_principal_id: str


def recortar_a_max_opciones(
    opciones: Sequence[OpcionConRelevancia], max_options: int, applicability: Sequence[object]
) -> tuple[OpcionConRelevancia, ...]:
    """Las ``max_options`` primeras en el orden determinista; ``applicability`` debe estar vacío hasta US-125."""
    if applicability:
        raise ValueError("la selección por aplicabilidad (RN-28) llega con US-125")
    ordenadas = sorted(opciones, key=lambda o: (-o.relevance_score, o.chunk_principal_id))
    return tuple(ordenadas[:max_options])
