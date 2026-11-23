"""No inferencia de datos críticos faltantes (US-116 AC-1 y AC-5, FR-23): conteo e ids de caso, nunca textos (RN-14).

Un dato declarado como faltante es «desconocido»: la métrica cuenta los textos mostrados que le atribuyen un valor según
el juez acotado. Sin casos con faltantes vale ``null`` y figura «no medida» (``null`` ≠ ``0``); no fija ninguna meta.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from app.evaluation.metricas.resultado import ResultadoConsulta

ESTADO_MEDIDA = "medida"
ESTADO_NO_MEDIDA = "no_medida"


def no_inferencia(resultados: Sequence[ResultadoConsulta]) -> dict[str, Any]:
    """Casos con faltantes declarados que el juez examinó, cuáles tuvieron inferencias y cuántas veredictos no se
    pudieron interpretar. Un caso con veredictos inválidos y ninguna inferencia no cuenta como «sin inferencia»."""
    medidos = [r.no_inferencia for r in resultados if r.no_inferencia is not None]
    if not medidos:
        return {
            "estado": ESTADO_NO_MEDIDA,
            "casos": 0,
            "casos_sin_inferencia": 0,
            "casos_con_inferencia": [],
            "inferencias": None,
            "veredictos_invalidos": 0,
        }
    return {
        "estado": ESTADO_MEDIDA,
        "casos": len(medidos),
        "casos_sin_inferencia": sum(
            m.inferencias == 0 and m.veredictos_invalidos == 0 for m in medidos
        ),
        "casos_con_inferencia": [m.caso for m in medidos if m.inferencias > 0],
        "inferencias": sum(m.inferencias for m in medidos),
        "veredictos_invalidos": sum(m.veredictos_invalidos for m in medidos),
    }
