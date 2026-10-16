"""Agregación y selección de la fase A de ADR-39: de las corridas sueltas al reporte (sin E/S de modelos)."""

from __future__ import annotations

import statistics
from collections.abc import Sequence
from typing import Any

from app.evaluation.config_medicion import ConfigMedicion, ModeloSpec
from app.evaluation.model_selection import Medicion, Seleccion, seleccionar_componente, verificar_presupuesto_conjunto
from app.evaluation.reporte import medicion_a_dict, seleccion_a_dict


def nombre_candidato(spec: ModeloSpec, cuantizacion: str) -> str:
    return f"{spec.id}@{cuantizacion}"


def metrica_principal(componente: str, calidad: dict[str, Any]) -> float:
    if componente == "nli":
        return float(calidad["exactitud"]["total"])
    return float(calidad["metricas"]["total"]["recall_at_10"])


def agregar_corridas(corridas: Sequence[dict[str, Any]]) -> dict[str, Any]:
    """Mediana de memoria y p95 sobre las corridas; la calidad sale de la corrida 1 (determinista, ver huella)."""
    primera = next(c for c in corridas if "calidad" in c)
    huellas = {c.get("huella_sondas") for c in corridas}
    return {
        "corridas": len(corridas),
        "rss_carga_mb": statistics.median(c["rss_carga_mb"] for c in corridas),
        "rss_max_mb": statistics.median(c["rss_max_mb"] for c in corridas),
        "pico_rss_mb": statistics.median(c["pico_rss_mb"] for c in corridas),
        "p50_ms": statistics.median(c["latencia"]["p50_ms"] for c in corridas),
        "p95_ms": statistics.median(c["latencia"]["p95_ms"] for c in corridas),
        "p95_ms_por_corrida": [c["latencia"]["p95_ms"] for c in corridas],
        "rss_max_mb_por_corrida": [c["rss_max_mb"] for c in corridas],
        "determinista": len(huellas) == 1,
        "calidad": primera["calidad"],
        "sparse": primera.get("sparse"),
    }


def a_medicion(spec: ModeloSpec, cuantizacion: str, agregado: dict[str, Any], licencia: str) -> Medicion:
    return Medicion(
        candidato=nombre_candidato(spec, cuantizacion),
        etapa=spec.componente,
        memoria_gb=agregado["rss_max_mb"] / 1024.0,
        p95_ms=agregado["p95_ms"],
        licencia=licencia,
        metrica_principal=metrica_principal(spec.componente, agregado["calidad"]),
    )


def reporte_de_componente(
    componente: str, detalle: dict[str, dict[str, Any]], mediciones: Sequence[Medicion], config: ConfigMedicion
) -> tuple[dict[str, Any], Seleccion]:
    seleccion = seleccionar_componente(mediciones, config.restricciones, config.tolerancia_empate)
    return {
        "mediciones": [medicion_a_dict(m) for m in mediciones],
        "detalle": detalle,
        "seleccion": seleccion_a_dict(seleccion),
    }, seleccion


def presupuesto_conjunto(selecciones: dict[str, Seleccion], config: ConfigMedicion) -> dict[str, Any]:
    elegidos = [s.elegido for s in selecciones.values() if s.elegido is not None]
    cabe, total = verificar_presupuesto_conjunto(elegidos, config.restricciones)
    return {
        "cabe": cabe,
        "total_gb_con_llm": total,
        "limite_gb": config.restricciones.stack_memory_limit_gb,
        "llm_gb": config.restricciones.llm_budget_gb,
        "holgura_para_el_resto_gb": config.restricciones.stack_memory_limit_gb - total,
        "p95_suma_ms": sum(s.elegido.p95_ms for s in selecciones.values() if s.elegido is not None),
        "elegidos": [m.candidato for m in elegidos],
    }
