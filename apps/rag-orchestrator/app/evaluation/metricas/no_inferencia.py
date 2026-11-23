"""No inferencia de datos críticos faltantes (US-116 AC-1, FR-23). Esqueleto del commit rojo."""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from app.evaluation.metricas.resultado import ResultadoConsulta


def no_inferencia(resultados: Sequence[ResultadoConsulta]) -> dict[str, Any]:
    return {
        "estado": "no_medida",
        "casos": 0,
        "casos_sin_inferencia": 0,
        "casos_con_inferencia": [],
        "inferencias": None,
        "veredictos_invalidos": 0,
    }
