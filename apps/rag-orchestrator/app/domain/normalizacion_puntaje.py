"""Normalización del puntaje crudo del *reranker* a [0, 1] (RN-03): regla pura, sin E/S."""

from __future__ import annotations


def normalizar_a_unidad(puntajes: list[float]) -> list[float]:
    raise NotImplementedError
