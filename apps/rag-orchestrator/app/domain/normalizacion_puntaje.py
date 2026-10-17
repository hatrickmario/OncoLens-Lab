"""Normalización del puntaje crudo del *reranker* a [0, 1] (RN-03): regla pura, sin E/S."""

from __future__ import annotations

import math


def normalizar_a_unidad(puntajes: list[float]) -> list[float]:
    """Sigmoide del puntaje crudo: [0, 1] monótono (RN-03; el normalizador versionado lo fija US-055)."""
    return [_sigmoide(p) for p in puntajes]


def validar_puntaje_normalizado(puntaje: float) -> float:
    raise NotImplementedError


def _sigmoide(x: float) -> float:
    if x >= 0:
        return 1.0 / (1.0 + math.exp(-x))
    e = math.exp(x)  # estable para puntajes muy negativos
    return e / (1.0 + e)
