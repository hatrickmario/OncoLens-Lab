"""Normalización del puntaje crudo del *reranker* a [0, 1] (RN-03): regla pura, sin E/S."""

from __future__ import annotations

import math


def normalizar_a_unidad(puntajes: list[float]) -> list[float]:
    """Sigmoide del puntaje crudo: [0, 1] monótono (RN-03; el normalizador versionado lo fija US-055)."""
    return [_sigmoide(p) for p in puntajes]


def validar_puntaje_normalizado(puntaje: float) -> float:
    """Un reranker (o un fake) que devuelve algo que no sea un número finito en [0, 1] rompe el contrato (RN-03).

    ``TypeError`` si no es ``int``/``float`` (``bool`` incluido: ``True`` no es 1.0); ``ValueError`` si es NaN, infinito
    o está fuera de [0, 1].
    """
    if isinstance(puntaje, bool) or not isinstance(puntaje, int | float):
        raise TypeError("el puntaje del reranker debe ser un número")
    if not math.isfinite(puntaje) or not 0.0 <= puntaje <= 1.0:
        raise ValueError("el puntaje del reranker debe estar normalizado a [0, 1]")
    return puntaje


def _sigmoide(x: float) -> float:
    if x >= 0:
        return 1.0 / (1.0 + math.exp(-x))
    e = math.exp(x)  # estable para puntajes muy negativos
    return e / (1.0 + e)
