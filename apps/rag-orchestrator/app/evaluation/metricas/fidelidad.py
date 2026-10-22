"""Fidelidad por afirmación (US-072 AC-3): NLI principal y juez LLM local secundario, rotulado aparte."""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from app.evaluation.metricas.resultado import ResultadoConsulta


def fidelidad(resultados: Sequence[ResultadoConsulta]) -> dict[str, Any]:
    raise NotImplementedError("no implementado")
