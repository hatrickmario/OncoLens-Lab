"""Fidelidad por afirmación (US-072 AC-3): NLI principal y juez LLM local secundario, rotulado aparte.

Se mide sobre la propuesta CRUDA del generador (afirmaciones con cita válida): lo que el filtro de soporte deja pasar es
fiel por construcción (RN-01), así que esa cifra no dice nada del modelo. El juez LLM comparte sesgo con el generador
(ADR-41): su cifra nunca decide un umbral y el reporte marca cuántas veces discrepa del NLI.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from app.evaluation.metricas.resultado import ResultadoConsulta

ROTULO_SECUNDARIA = "secundaria"


def _fraccion(soportadas: int, afirmaciones: int) -> dict[str, Any]:
    return {
        "afirmaciones": afirmaciones,
        "soportadas": soportadas,
        "fidelidad": soportadas / afirmaciones if afirmaciones else None,
    }


def fidelidad(resultados: Sequence[ResultadoConsulta]) -> dict[str, Any]:
    nli = [v for r in resultados for v in r.afirmaciones_nli]
    familia: dict[str, Any] = {"nli": _fraccion(sum(nli), len(nli))}
    con_juez = [r for r in resultados if r.afirmaciones_juez is not None]
    if con_juez:
        juez = [v for r in con_juez for v in r.afirmaciones_juez or ()]
        del_nli = [v for r in con_juez for v in r.afirmaciones_nli]
        familia["juez_llm"] = {
            "rotulo": ROTULO_SECUNDARIA,
            **_fraccion(sum(juez), len(juez)),
            "discrepancias_con_nli": sum(a != b for a, b in zip(del_nli, juez, strict=True)),
        }
    return familia
