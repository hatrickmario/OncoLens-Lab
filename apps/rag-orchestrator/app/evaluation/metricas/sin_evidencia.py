"""Exactitud de «sin evidencia» (RN-02): la respuesta es ``sin_evidencia`` si y solo si la pregunta no tiene evidencia."""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from app.evaluation.metricas.resultado import ResultadoConsulta


def _viola_rn02(r: ResultadoConsulta) -> bool:
    """Sin evidencia con LLM invocado o con ``topRelevanceScore`` distinto de ``null`` (incluido ``0.0``)."""
    return r.sin_evidencia and (r.generador_invocado or r.top_relevance_score is not None)


def exactitud_sin_evidencia(resultados: Sequence[ResultadoConsulta]) -> dict[str, Any]:
    aciertos = sum(r.sin_evidencia == r.esperaba_sin_evidencia for r in resultados)
    return {
        "exactitud": aciertos / len(resultados) if resultados else None,
        "n": len(resultados),
        "violaciones_rn02": sum(_viola_rn02(r) for r in resultados),
    }
