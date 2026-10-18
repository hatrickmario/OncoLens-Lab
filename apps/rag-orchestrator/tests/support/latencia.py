"""Medición de latencia por etapa de los adapters reales (US-231a AC-9, NFR-01, ADR-39).

El reloj se inyecta (segundos, monótono): ``time.perf_counter`` en la medición local y uno controlado en los tests.
El informe nunca lleva texto de entrada (solo etapa, milisegundos y presupuesto).
"""

from __future__ import annotations

import statistics
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class Etapa:
    nombre: str
    corridas_ms: Sequence[float]
    presupuesto_ms: float


def mediana(valores: Sequence[float]) -> float:
    if not valores:
        raise ValueError("no hay corridas que resumir")
    return float(statistics.median(valores))


def medir_etapa(
    ejecutar: Callable[[], object],
    reloj: Callable[[], float],
    *,
    corridas: int = 3,
    calentamiento: int = 1,
) -> list[float]:
    """Milisegundos de cada corrida cronometrada, tras descartar las de calentamiento (carga perezosa de pesos)."""
    for _ in range(calentamiento):
        ejecutar()
    tomas: list[float] = []
    for _ in range(corridas):
        inicio = reloj()
        ejecutar()
        tomas.append((reloj() - inicio) * 1000.0)
    return tomas


def informe_de_latencia(etapas: Sequence[Etapa]) -> dict[str, dict[str, Any]]:
    """Mediana de cada etapa frente a su presupuesto; un exceso queda en el informe, nunca se oculta ni se ajusta."""
    informe: dict[str, dict[str, Any]] = {}
    for etapa in etapas:
        resumen = mediana(etapa.corridas_ms)
        entrada: dict[str, Any] = {
            "corridas_ms": list(etapa.corridas_ms),
            "mediana_ms": resumen,
            "presupuesto_ms": etapa.presupuesto_ms,
            "dentro_de_presupuesto": resumen <= etapa.presupuesto_ms,
        }
        if resumen > etapa.presupuesto_ms:
            entrada["exceso_ms"] = resumen - etapa.presupuesto_ms
        informe[etapa.nombre] = entrada
    return informe
