"""Latencia por etapa de la suite (p95): el reloj de medición se inyecta (``simulado`` o ``time.perf_counter``)."""

from __future__ import annotations

import math
from collections.abc import Awaitable, Callable, Sequence
from typing import TypeVar

ETAPAS = (
    "idioma",
    "catalogo",
    "embeddings",
    "busqueda",
    "reranker",
    "generacion",
    "nli",
    "consulta",
)
TICK_SIMULADO_S = 0.001
_R = TypeVar("_R")


class RelojSimulado:
    """Cada lectura avanza 1 ms: toda duración medida con él es reproducible."""

    def __init__(self) -> None:
        self._lecturas = 0

    def __call__(self) -> float:
        self._lecturas += 1
        return self._lecturas * TICK_SIMULADO_S


def percentil(valores: Sequence[float], fraccion: float) -> float | None:
    """Percentil por rango más cercano; ``None`` (≠ 0.0) si la etapa no se ejecutó."""
    if not valores:
        return None
    ordenados = sorted(valores)
    return ordenados[math.ceil(fraccion * len(ordenados)) - 1]


def percentil_95(valores: Sequence[float]) -> float | None:
    return percentil(valores, 0.95)


def resumen_de_latencia(valores_ms: Sequence[float]) -> dict[str, float | None]:
    """Muestra, p50 y p95 de una serie de latencias; sin muestra, ``None`` y no ``0.0``."""
    return {
        "n": len(valores_ms),
        "p50_ms": percentil(valores_ms, 0.50),
        "p95_ms": percentil(valores_ms, 0.95),
    }


class Cronometro:
    def __init__(self, reloj: Callable[[], float]) -> None:
        self._reloj = reloj
        self._duraciones_ms: dict[str, list[float]] = {etapa: [] for etapa in ETAPAS}

    def medir(self, etapa: str, funcion: Callable[..., _R], *argumentos: object) -> _R:
        inicio = self._reloj()
        try:
            return funcion(*argumentos)
        finally:
            self._registrar(etapa, inicio)

    async def medir_async(
        self, etapa: str, funcion: Callable[..., Awaitable[_R]], *argumentos: object
    ) -> _R:
        inicio = self._reloj()
        try:
            return await funcion(*argumentos)
        finally:
            self._registrar(etapa, inicio)

    def ultima_duracion_ms(self, etapa: str) -> float:
        """Duración de la última medición de la etapa (la que acaba de terminar ``medir``)."""
        return self._duraciones_ms[etapa][-1]

    def p95_ms(self) -> dict[str, float | None]:
        return {etapa: percentil_95(d) for etapa, d in self._duraciones_ms.items()}

    def _registrar(self, etapa: str, inicio: float) -> None:
        self._duraciones_ms[etapa].append(round((self._reloj() - inicio) * 1000.0, 6))
