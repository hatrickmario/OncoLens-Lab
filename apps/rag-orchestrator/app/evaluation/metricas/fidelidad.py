"""Fidelidad por afirmación (US-072 AC-3): NLI principal y juez LLM local secundario, rotulado aparte.

Se mide sobre la propuesta CRUDA del generador (afirmaciones con cita válida): lo que el filtro de soporte deja pasar es
fiel por construcción (RN-01), así que esa cifra no dice nada del modelo. El juez LLM comparte sesgo con el generador
(ADR-41): su cifra nunca decide un umbral y el reporte marca cuántas veces discrepa del NLI.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from app.evaluation.acuerdo_juez import (
    SIN_MEDIR,
    acuerdo_con_el_nli,
    estado_de_la_fidelidad_del_juez,
)
from app.evaluation.metricas.resultado import ResultadoConsulta

ROTULO_SECUNDARIA = "secundaria"


def _fraccion(soportadas: int, afirmaciones: int) -> dict[str, Any]:
    return {
        "afirmaciones": afirmaciones,
        "soportadas": soportadas,
        "fidelidad": soportadas / afirmaciones if afirmaciones else None,
    }


def fidelidad(
    resultados: Sequence[ResultadoConsulta], acuerdo_minimo: float | None = None
) -> dict[str, Any]:
    """``acuerdo_minimo`` (``JUEZ_ACUERDO_MINIMO``) solo existe si hay juez configurado; sin él no se mide el acuerdo."""
    nli = [v for r in resultados for v in r.afirmaciones_nli]
    familia: dict[str, Any] = {"nli": _fraccion(sum(nli), len(nli))}
    con_juez = [r for r in resultados if r.afirmaciones_juez is not None]
    if con_juez:
        juez = [v for r in con_juez for v in r.afirmaciones_juez or ()]
        del_nli = [v for r in con_juez for v in r.afirmaciones_nli]
        ids = [i for r in con_juez for i in r.ids_afirmaciones]
        acuerdo = acuerdo_con_el_nli(ids, del_nli, juez)
        familia["juez_llm"] = {
            "rotulo": ROTULO_SECUNDARIA,
            **_fraccion(sum(juez), len(juez)),
            "discrepancias_con_nli": sum(a != b for a, b in zip(del_nli, juez, strict=True)),
            "veredictos_invalidos": sum(r.veredictos_invalidos_juez for r in con_juez),
            "acuerdo_con_nli": acuerdo,
            "acuerdo_con_humano": SIN_MEDIR,  # la muestra del oncólogo llega con DEC-06 (S5)
            "estado": estado_de_la_fidelidad_del_juez(acuerdo["porcentaje"], acuerdo_minimo),
        }
    return familia
