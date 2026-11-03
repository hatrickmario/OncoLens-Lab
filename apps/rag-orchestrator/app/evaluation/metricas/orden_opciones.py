"""Orden de las opciones mostradas según RN-28 (US-140). Esqueleto: se implementa con el verde de los AC."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass


@dataclass(frozen=True)
class OpcionOrdenable:
    id: str
    excluyentes_no_coincide: int
    coincide: int
    relevance_score: float
    poblacion_no_comparable: bool


def ids_con_orden_violado(opciones: Sequence[OpcionOrdenable]) -> tuple[str, ...]:
    raise NotImplementedError("no implementado")


def orden_conforme_rn28(opciones: Sequence[OpcionOrdenable]) -> bool:
    raise NotImplementedError("no implementado")


def ids_no_comparables_antes_de_una_comparable(
    opciones: Sequence[OpcionOrdenable],
) -> tuple[str, ...]:
    raise NotImplementedError("no implementado")


def no_comparable_al_final(opciones: Sequence[OpcionOrdenable]) -> bool:
    raise NotImplementedError("no implementado")
