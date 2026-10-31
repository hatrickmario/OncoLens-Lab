"""Estadística única de la suite `evaluate` (D4-09): medianas y percentiles en un solo lugar.

Dos definiciones de percentil conviven a propósito y NO son comparables entre sí:

* ``percentil_rango_mas_cercano``: el elemento de la muestra ordenada (los reportes de ``evaluate``). Sobre
  ``[10, 20, 30, 40]`` el p95 es ``40.0``.
* ``percentil_interpolado``: interpolación lineal (las cifras históricas de ADR-39). El mismo p95 es ``38.5``.

Una muestra vacía da ``None`` (≠ ``0.0``) en la primera y ``ValueError`` en las otras: no hay valor que inventar.
"""

from __future__ import annotations

import math
import statistics
from collections.abc import Iterable

import numpy as np


def mediana(valores: Iterable[float]) -> float:
    """Mediana de ``statistics`` (promedia los dos centrales en una muestra par); ``ValueError`` si está vacía."""
    return float(statistics.median(valores))


def percentil_rango_mas_cercano(valores: Iterable[float], fraccion: float) -> float | None:
    """Percentil por rango más cercano; ``None`` (≠ ``0.0``) si la muestra está vacía."""
    ordenados = sorted(valores)
    if not ordenados:
        return None
    return ordenados[math.ceil(fraccion * len(ordenados)) - 1]


def percentil_interpolado(valores: Iterable[float], porcentaje: float) -> float:
    """Percentil con interpolación lineal (``porcentaje`` en 0-100); ``ValueError`` si la muestra está vacía."""
    muestra = np.asarray(list(valores), dtype=float)
    if muestra.size == 0:
        raise ValueError("percentil de una muestra vacía")
    return float(np.percentile(muestra, porcentaje))
