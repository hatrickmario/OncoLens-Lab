"""Fidelidad por afirmación (US-072 AC-3): NLI principal y juez LLM local secundario, rotulado aparte.

Se mide sobre la propuesta CRUDA del generador (afirmaciones con cita válida): lo que el filtro de soporte deja pasar es
fiel por construcción (RN-01), así que esa cifra no dice nada del modelo. El juez LLM comparte sesgo con el generador
(ADR-41): su cifra nunca decide un umbral y el reporte marca cuántas veces discrepa del NLI.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from app.evaluation.acuerdo_juez import (
    ESTADO_CONCLUYENTE,
    SIN_MEDIR,
    acuerdo_con_el_nli,
    estado_de_la_fidelidad_del_juez,
)
from app.evaluation.config_suite import ConfigInvalida
from app.evaluation.metricas.resultado import ResultadoConsulta

ROTULO_SECUNDARIA = "secundaria"


def _fraccion(soportadas: int, afirmaciones: int) -> dict[str, Any]:
    return {
        "afirmaciones": afirmaciones,
        "soportadas": soportadas,
        "fidelidad": soportadas / afirmaciones if afirmaciones else None,
    }


def _exigir_minimos(acuerdo_minimo: float | None, muestra_minima: int | None) -> tuple[float, int]:
    """Con juez, ambos mínimos son configuración obligatoria (RN-22): no hay valor por defecto en código."""
    if acuerdo_minimo is None:
        raise ConfigInvalida(
            "falta JUEZ_ACUERDO_MINIMO (juez.acuerdo_minimo) para decidir si el juez concluye"
        )
    if muestra_minima is None:
        raise ConfigInvalida(
            "falta JUEZ_MUESTRA_MINIMA (juez.muestra_minima) para decidir si el juez concluye"
        )
    return acuerdo_minimo, muestra_minima


def _juez_llm(
    con_juez: Sequence[ResultadoConsulta], acuerdo_minimo: float | None, muestra_minima: int | None
) -> dict[str, Any]:
    minimo, muestra_requerida = _exigir_minimos(acuerdo_minimo, muestra_minima)
    juez = [v for r in con_juez for v in r.afirmaciones_juez or ()]
    del_nli = [v for r in con_juez for v in r.afirmaciones_nli]
    ids = [i for r in con_juez for i in r.ids_afirmaciones]
    acuerdo = acuerdo_con_el_nli(ids, del_nli, juez)
    estado = estado_de_la_fidelidad_del_juez(
        acuerdo["porcentaje"], minimo, acuerdo["muestra"], muestra_requerida
    )
    cifra = _fraccion(sum(juez), len(juez))
    informativo = None
    if estado != ESTADO_CONCLUYENTE:
        # Sin concluir no hay cifra de fidelidad: el valor sigue en el reporte, aparte y rotulado informativo.
        informativo = cifra["fidelidad"]
        cifra = {**cifra, "fidelidad": None}
    return {
        "rotulo": ROTULO_SECUNDARIA,
        **cifra,
        "discrepancias_con_nli": len(acuerdo["discrepancias"]),
        "veredictos_invalidos": sum(r.veredictos_invalidos_juez for r in con_juez),
        "acuerdo_con_nli": acuerdo,
        "acuerdo_con_humano": SIN_MEDIR,  # la muestra del oncólogo llega con DEC-06 (S5)
        "estado": estado,
        "valor_informativo": informativo,
    }


def fidelidad(
    resultados: Sequence[ResultadoConsulta],
    acuerdo_minimo: float | None,
    muestra_minima: int | None,
) -> dict[str, Any]:
    """``acuerdo_minimo`` (``JUEZ_ACUERDO_MINIMO``) y ``muestra_minima`` (``JUEZ_MUESTRA_MINIMA``) son obligatorios y sin
    valor por defecto (RN-22): ``None`` solo es válido si no hay juez configurado (entonces no se mide el acuerdo)."""
    nli = [v for r in resultados for v in r.afirmaciones_nli]
    familia: dict[str, Any] = {"nli": _fraccion(sum(nli), len(nli))}
    con_juez = [r for r in resultados if r.afirmaciones_juez is not None]
    if con_juez:
        familia["juez_llm"] = _juez_llm(con_juez, acuerdo_minimo, muestra_minima)
    return familia
