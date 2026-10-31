"""Arma la sección ``comparacion_recuperacion`` del reporte (US-133): agregados y configuración, nunca textos (RN-14)."""

from __future__ import annotations

import math
import statistics
from collections import defaultdict
from collections.abc import Sequence
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


@dataclass(frozen=True)
class ComparacionArmada:
    seccion: dict[str, Any]
    """La sección ``comparacion_recuperacion`` del reporte."""
    retroceso: bool
    """Algún brazo híbrido retrocedió frente a A0: decide el código de salida sin releer el reporte."""


def armar_comparacion(
    config: ConfigSuite, comparacion: Comparacion, brazos: Sequence[ResultadoDeBrazo]
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
    armados = []
    for b, recuperacion in zip(brazos, recuperaciones, strict=True):
        modo, fusion, parametro = b.brazo.trazado_esperado()
        armado: dict[str, Any] = {
            "nombre": b.brazo.nombre,
            "retrievalMode": modo.value,
            "fusion": fusion.value,
            "fusionParam": parametro,
            "huellaConfig": b.brazo.huella(),
            "recuperacion": recuperacion,
            "retroceso": False,
            "trazabilidad": _trazabilidad(b),
            "sin_terminos_lexicos": _sin_terminos(b),
            "por_documento": _por_documento(b),
        }
        if b.brazo.nombre != REFERENCIA:
            diferencia = diferencia_frente_referencia(_metricas_de(recuperacion), referencia)
            armado["diferencia_frente_a_a0"] = _diferencia_a_dict(diferencia)
            armado["retroceso"] = marcar_retroceso(diferencia, comparacion.tolerancia_retroceso)
        armados.append(armado)
    hay_retroceso = any(a["retroceso"] for a in armados)
    seccion = {
        "referencia": REFERENCIA,
        "tolerancia_retroceso": comparacion.tolerancia_retroceso,
        "retroceso": hay_retroceso,
        "brazos": armados,
    }
    return ComparacionArmada(seccion, hay_retroceso)
