"""Porcentaje de opciones propuestas que salen mostradas con cita y soporte (RN-01); el resto va a descartadas."""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from app.evaluation.metricas.resultado import ResultadoConsulta


def porcentaje_con_cita_y_soporte(resultados: Sequence[ResultadoConsulta]) -> dict[str, Any]:
    mostradas = sum(r.opciones_mostradas for r in resultados)
    total = mostradas + sum(r.opciones_descartadas for r in resultados)
    return {"porcentaje": mostradas / total if total else None, "n": total}
