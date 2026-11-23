"""Ventanas del reranker sobre un chunk largo (US-278, RN-03, RN-22): reglas puras, sin E/S."""

from __future__ import annotations

import math
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
    """Tramos de a lo sumo ``capacidad`` tokens que cubren el pasaje entero, con ``solape`` tokens entre vecinos.

    La primera empieza en 0 y el paso es ``capacidad - solape``; la última termina exactamente en el final del pasaje
    (se retrocede su inicio en vez de dejar una ventana corta). Un pasaje que cabe da una sola ventana.
    ``ValueError`` si no hay pasaje, si la capacidad no es positiva o si el solape es negativo o no deja avanzar.
    """
    if longitud_del_pasaje <= 0:
        raise ValueError("el pasaje no tiene tokens")
    if capacidad <= 0 or solape < 0 or solape >= capacidad:
        raise ValueError("la capacidad debe ser positiva y mayor que el solape")
    paso = capacidad - solape
    ventanas = [Ventana(0, min(capacidad, longitud_del_pasaje))]
    while ventanas[-1].fin < longitud_del_pasaje:
        inicio = min(ventanas[-1].inicio + paso, longitud_del_pasaje - capacidad)
        ventanas.append(Ventana(inicio, inicio + capacidad))
    return tuple(ventanas)


def agregar_por_maximo(logits_por_ventana: Sequence[float]) -> float:
    """El mayor logit de las ventanas de un chunk (RN-03): se agrega antes de normalizar, una sola sigmoide después.

    Conmutativo y asociativo: el resultado no depende del orden ni del lote (IA-07). Sin ventanas o con un logit no
    finito falla en vez de devolver ``0.0`` (``null`` ≠ ``0.0``, RN-02).
    """
    if not logits_por_ventana:
        raise ValueError("el chunk no tiene ventanas que agregar")
    if not all(math.isfinite(logit) for logit in logits_por_ventana):
        raise ValueError("el logit de una ventana no es finito")
    return max(logits_por_ventana)
