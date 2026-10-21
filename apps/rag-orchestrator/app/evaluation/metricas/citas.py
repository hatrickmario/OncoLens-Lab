"""Precisión de citas (RN-01, RN-04): fracción de citas propuestas que apuntan a un chunk recuperado en esa consulta."""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from app.evaluation.metricas.resultado import ResultadoConsulta


def precision_de_citas(resultados: Sequence[ResultadoConsulta]) -> dict[str, Any]:
    propuestas = sum(r.citas_propuestas for r in resultados)
    validas = sum(r.citas_validas for r in resultados)
    return {"precision": validas / propuestas if propuestas else None, "n": propuestas}
