"""Ventanas del reranker sobre un chunk largo (US-278, RN-03, RN-22): reglas puras, sin E/S."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Literal

ModoDeVentanas = Literal["primera", "maximo"]
"""``primera``: solo la primera ventana (comportamiento vigente). ``maximo``: ventanas solapadas, puntaje = el máximo."""

MODO_DE_VENTANAS_INICIAL: ModoDeVentanas = "primera"
"""Valor inicial de ``RERANKER_CHUNK_WINDOWS`` (RN-22): una sola definición para Settings y el adapter."""

RERANKER_WINDOW_OVERLAP_INICIAL = 64
"""Valor inicial de ``RERANKER_WINDOW_OVERLAP`` (tokens, RN-22); solo se lee con ``maximo``."""


@dataclass(frozen=True)
class Ventana:
    """Tramo ``[inicio, fin)`` sobre los tokens del pasaje."""

    inicio: int
    fin: int


def trazar_ventanas(longitud_del_pasaje: int, capacidad: int, solape: int) -> tuple[Ventana, ...]:
    raise NotImplementedError("no implementado")


def agregar_por_maximo(logits_por_ventana: Sequence[float]) -> float:
    raise NotImplementedError("no implementado")
