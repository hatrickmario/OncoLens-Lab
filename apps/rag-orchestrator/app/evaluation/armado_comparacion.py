"""Arma la sección ``comparacion_recuperacion`` del reporte (US-133): agregados y configuración, nunca textos (RN-14)."""

from __future__ import annotations

import math
import statistics
from collections import defaultdict
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from app.evaluation.brazos_recuperacion import (
    REFERENCIA,
    MetricasDeBrazo,
    diferencia_frente_referencia,
    marcar_retroceso,
    trazado_coherente,
)
from app.evaluation.config_suite import Comparacion, ConfigSuite
from app.evaluation.corrida_brazos import ResultadoDeBrazo
from app.evaluation.guardas import SuiteAbortada
from app.evaluation.metricas.familias import familias_de_recuperacion
from app.evaluation.viabilidad_del_brazo import viabilidad_del_brazo


def _o_none(valor: float) -> float | None:
    return None if math.isnan(valor) else valor


def _metricas_de(recuperacion: dict[str, Any]) -> MetricasDeBrazo:
    total, es_a_en = recuperacion["total"], recuperacion["es_a_en"]
    return MetricasDeBrazo(
        _o_none(total["recall_at_10"]), _o_none(es_a_en["recall_at_10"]), _o_none(total["mrr"])
    )


def _diferencia_a_dict(diferencia: MetricasDeBrazo) -> dict[str, float | None]:
    return {
        "recall_at_10_total": diferencia.recall_at_10_total,
        "recall_at_10_es_a_en": diferencia.recall_at_10_es_a_en,
        "mrr": diferencia.mrr,
    }


def _por_documento(brazo: ResultadoDeBrazo) -> list[dict[str, Any]]:
    """Recall@10 por documento esperado (ADR-45 P12): una conclusión no puede descansar en un solo documento."""
    recalls: dict[str, list[float]] = defaultdict(list)
    for r in brazo.resultados:
        for documento in r.recuperacion.documentos:
            if r.recuperacion.recall is not None:
                recalls[documento].append(r.recuperacion.recall)
    return [
        {"documento": d, "recall_at_10": statistics.mean(v), "n": len(v)}
        for d, v in sorted(recalls.items())
    ]


def _coherentes(brazo: ResultadoDeBrazo) -> int:
    return sum(
        trazado_coherente(
            brazo.brazo,
            meta.retrievalParams.retrievalMode,
            meta.retrievalParams.fusion,
            meta.retrievalParams.fusionParam,
        )
        for meta in brazo.metas
    )


def exigir_trazabilidad_coherente(brazo: ResultadoDeBrazo) -> None:
    """Toda consulta del brazo trajo el modo, la fusión y el parámetro de su brazo; si no, la corrida aborta."""
    if _coherentes(brazo) != len(brazo.metas):
        raise SuiteAbortada(
            f"el brazo {brazo.brazo.nombre} trajo consultas con retrievalParams de otro brazo"
        )


def _trazabilidad(brazo: ResultadoDeBrazo) -> dict[str, int]:
    """Cuántas consultas respondieron y cuántas trajeron en ``meta.retrievalParams`` la traza de su brazo."""
    return {"consultas": len(brazo.metas), "coherentes": _coherentes(brazo)}


def _sin_terminos(brazo: ResultadoDeBrazo) -> dict[str, float | int]:
    """Preguntas que cayeron en «sin términos léxicos» (ADR-48): ``0`` y ``0.0`` si ninguna, nunca ``null``."""
    total = len(brazo.resultados)
    return {
        "n": brazo.sin_terminos_lexicos,
        "proporcion": brazo.sin_terminos_lexicos / total if total else 0.0,
    }


# --- los brazos del reranker (US-278): solo aparecen si la comparación declara brazos que cambian la etapa del reranker ---------


def _falsos_sin_evidencia(brazo: ResultadoDeBrazo) -> dict[str, int]:
    """Preguntas con respuesta esperada que terminaron en ``sin_evidencia`` (RN-02), sobre las que tienen respuesta esperada."""
    con_respuesta = [r for r in brazo.resultados if not r.esperaba_sin_evidencia]
    return {"n": sum(r.sin_evidencia for r in con_respuesta), "total": len(con_respuesta)}


def _parafrasis_recuperadas(
    brazo: ResultadoDeBrazo, pares: Mapping[str, tuple[str, ...]]
) -> dict[str, int]:
    """Pares en los que TODAS las redacciones recuperan el fragmento esperado en el top 10 (``recall`` > 0, ``None`` no cuenta)."""
    recall = {r.recuperacion.id: r.recuperacion.recall for r in brazo.resultados}
    recuperadas = sum(
        all((recall.get(pregunta) or 0.0) > 0.0 for pregunta in preguntas)
        for preguntas in pares.values()
    )
    return {"pares": len(pares), "recuperadas": recuperadas}


def _latencia(brazo: ResultadoDeBrazo) -> dict[str, float | None]:
    """p95 de la etapa del reranker y de la consulta completa, en ms; ``None`` (≠ ``0.0``) si la etapa no se midió."""
    p95 = brazo.servicio.cronometro.p95_ms()
    return {"reranker_p95": p95["reranker"], "consulta_p95": p95["consulta"]}


def _etapa_del_reranker(brazo: ResultadoDeBrazo) -> dict[str, Any] | None:
    """Modo, solape, largo y pares con los que corrió el brazo: el informe es el único lugar donde queda el modo (D4)."""
    c = brazo.reranker
    if c is None:
        return None
    return {
        "modo": c.modo,
        "solape": c.solape,
        "max_length": c.max_length,
        "max_pairs": c.max_pairs,
    }


def _restar_opcional(valor: float | None, referencia: float | None) -> float | None:
    return None if valor is None or referencia is None else valor - referencia


def _extras_del_reranker(
    brazo: ResultadoDeBrazo,
    comparacion: Comparacion,
    pares: Mapping[str, tuple[str, ...]],
    memoria_del_stack: Mapping[str, float],
) -> dict[str, Any]:
    viabilidad = comparacion.viabilidad
    if viabilidad is None:  # la carga de la configuración lo exige: no hay topes inventados
        raise SuiteAbortada("la comparación del reranker no trae los topes de viabilidad")
    latencia = _latencia(brazo)
    p95_s = None if latencia["consulta_p95"] is None else latencia["consulta_p95"] / 1000.0
    resultado = viabilidad_del_brazo(
        p95_s,
        viabilidad.tope_p95_s,
        memoria_del_stack.get(brazo.brazo.nombre),
        viabilidad.limite_memoria_gb,
    )
    return {
        "reranker": _etapa_del_reranker(brazo),
        "falsos_sin_evidencia": _falsos_sin_evidencia(brazo),
        "parafrasis": _parafrasis_recuperadas(brazo, pares),
        "latencia_ms": latencia,
        "viabilidad": {
            "estado": resultado.estado,
            "motivos": list(resultado.motivos),
            "p95_consulta_s": resultado.p95_consulta_s,
            "tope_p95_s": resultado.tope_p95_s,
            "memoria_gb": resultado.memoria_gb,
            "limite_memoria_gb": resultado.limite_memoria_gb,
        },
    }


def _diferencias_extra(
    armado: dict[str, Any], referencia: dict[str, Any]
) -> dict[str, float | None]:
    return {
        "falsos_sin_evidencia": armado["falsos_sin_evidencia"]["n"]
        - referencia["falsos_sin_evidencia"]["n"],
        "parafrasis_recuperadas": armado["parafrasis"]["recuperadas"]
        - referencia["parafrasis"]["recuperadas"],
        "p95_reranker_ms": _restar_opcional(
            armado["latencia_ms"]["reranker_p95"], referencia["latencia_ms"]["reranker_p95"]
        ),
        "p95_consulta_ms": _restar_opcional(
            armado["latencia_ms"]["consulta_p95"], referencia["latencia_ms"]["consulta_p95"]
        ),
    }


@dataclass(frozen=True)
class ComparacionArmada:
    seccion: dict[str, Any]
    """La sección ``comparacion_recuperacion`` del reporte."""
    retroceso: bool
    """Algún brazo híbrido retrocedió frente a A0: decide el código de salida sin releer el reporte."""


def _datos_del_brazo(brazo: ResultadoDeBrazo, recuperacion: dict[str, Any]) -> dict[str, Any]:
    """Lo que el informe dice de un brazo antes de compararlo con la referencia: su configuración y sus métricas."""
    modo, fusion, parametro = brazo.brazo.trazado_esperado()
    return {
        "nombre": brazo.brazo.nombre,
        "retrievalMode": modo.value,
        "fusion": fusion.value,
        "fusionParam": parametro,
        "huellaConfig": brazo.brazo.huella(),
        "recuperacion": recuperacion,
        "retroceso": False,
        "trazabilidad": _trazabilidad(brazo),
        "sin_terminos_lexicos": _sin_terminos(brazo),
        "por_documento": _por_documento(brazo),
    }


def armar_comparacion(
    config: ConfigSuite,
    comparacion: Comparacion,
    brazos: Sequence[ResultadoDeBrazo],
    *,
    pares_de_parafrasis: Mapping[str, tuple[str, ...]] | None = None,
    memoria_del_stack: Mapping[str, float] | None = None,
    corpus: Mapping[str, Any] | None = None,
) -> ComparacionArmada:
    for brazo in brazos:
        exigir_trazabilidad_coherente(brazo)  # antes de armar ningún dato
    recuperaciones = [
        familias_de_recuperacion(
            b.resultados, config.semilla_bootstrap, config.bootstrap_repeticiones
        )
        for b in brazos
    ]
    referencia = _metricas_de(recuperaciones[0])
    armados: list[dict[str, Any]] = []
    for b, recuperacion in zip(brazos, recuperaciones, strict=True):
        armado = _datos_del_brazo(b, recuperacion)
        del_reranker = comparacion.viabilidad is not None
        if del_reranker:
            armado.update(
                _extras_del_reranker(
                    b, comparacion, pares_de_parafrasis or {}, memoria_del_stack or {}
                )
            )
        if b.brazo.nombre != REFERENCIA:
            diferencia = diferencia_frente_referencia(_metricas_de(recuperacion), referencia)
            armado["diferencia_frente_a_a0"] = _diferencia_a_dict(diferencia)
            if del_reranker:
                armado["diferencia_frente_a_a0"].update(_diferencias_extra(armado, armados[0]))
            armado["retroceso"] = marcar_retroceso(diferencia, comparacion.tolerancia_retroceso)
        armados.append(armado)
    hay_retroceso = any(a["retroceso"] for a in armados)
    seccion = {
        "referencia": REFERENCIA,
        "tolerancia_retroceso": comparacion.tolerancia_retroceso,
        "retroceso": hay_retroceso,
        "brazos": armados,
        **({} if corpus is None else {"corpus": dict(corpus)}),
    }
    return ComparacionArmada(seccion, hay_retroceso)
