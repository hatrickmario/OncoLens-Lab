"""Las familias de métricas de una población de consultas; ``suite`` elige cuáles se calculan."""

from __future__ import annotations

import dataclasses
from collections.abc import Sequence
from typing import Any

from app.evaluation.metricas.citas import precision_de_citas
from app.evaluation.metricas.fidelidad import fidelidad
from app.evaluation.metricas.inyeccion import inyeccion_efectiva
from app.evaluation.metricas.opciones import porcentaje_con_cita_y_soporte
from app.evaluation.metricas.prescriptivas import terminos_prohibidos
from app.evaluation.metricas.resultado import ResultadoConsulta
from app.evaluation.metricas.sin_evidencia import exactitud_sin_evidencia
from app.evaluation.retrieval_metrics import Metrica, metrica
from app.evaluation.rotulo import rotular_validada


def _recuperacion(m: Metrica) -> dict[str, Any]:
    return {
        "recall_at_10": m.recall_at_10,
        "mrr": m.mrr,
        "n": m.n,
        "recall_ic95": {"inferior": m.recall_ic95[0], "superior": m.recall_ic95[1]},
        "mrr_ic95": {"inferior": m.mrr_ic95[0], "superior": m.mrr_ic95[1]},
    }


def familias_de_recuperacion(
    resultados: Sequence[ResultadoConsulta], semilla: int, repeticiones: int
) -> dict[str, Any]:
    de_pregunta = [r.recuperacion for r in resultados]
    return {
        "total": _recuperacion(metrica(de_pregunta, semilla, repeticiones)),
        "es_a_en": _recuperacion(
            metrica([r for r in de_pregunta if r.es_es_en], semilla, repeticiones)
        ),
    }


def calcular_familias(
    resultados: Sequence[ResultadoConsulta],
    suite: str,
    semilla: int,
    repeticiones: int,
    acuerdo_minimo: float | None = None,
) -> dict[str, Any]:
    familias: dict[str, Any] = {}
    if suite in ("retrieval", "all"):
        familias["recuperacion"] = familias_de_recuperacion(resultados, semilla, repeticiones)
    if suite in ("generation", "all"):
        familias["citas"] = precision_de_citas(resultados)
        familias["sin_evidencia"] = exactitud_sin_evidencia(resultados)
        familias["opciones_con_cita_y_soporte"] = porcentaje_con_cita_y_soporte(resultados)
        familias["fidelidad"] = fidelidad(resultados, acuerdo_minimo)
        familias["terminos_prohibidos"] = terminos_prohibidos(resultados)
        familias["inyeccion"] = inyeccion_efectiva(resultados)
    validacion = _validacion_de(resultados)
    for familia in familias.values():
        familia["validacion"] = validacion
    return familias


def _validacion_de(resultados: Sequence[ResultadoConsulta]) -> dict[str, Any]:
    validadas = sum(r.revisada for r in resultados)
    return dataclasses.asdict(rotular_validada(validadas, len(resultados) - validadas))
