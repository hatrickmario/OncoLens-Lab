"""La configuración de la fase A es el registro histórico de lo que se midió: debe coincidir con su reporte."""

from __future__ import annotations

import json

import yaml

from tests.evaluation.conftest import RAIZ_APP, RAIZ_REPO

CONFIG_FASE_A = RAIZ_APP / "eval" / "configs" / "adr39-fase-a.yaml"
REPORTE_FASE_A = RAIZ_REPO / "reports" / "adr39" / "2026-10-16-fase-a.json"


def test_fase_a_las_restricciones_del_yaml_solo_difieren_del_reporte_en_los_topes_de_memoria_documentados() -> None:
    """El YAML de la fase A está congelado (decisión del 2026-10-20): conserva 30/21 GB y el reporte se midió con 24/16.

    Ningún descarte de la fase A fue por memoria; la salvedad está registrada en el ADR-39. Cualquier otra diferencia es un error.
    """
    config = yaml.safe_load(CONFIG_FASE_A.read_text(encoding="utf-8"))
    reporte = json.loads(REPORTE_FASE_A.read_text(encoding="utf-8"))

    diferencias = {
        k: (config["restricciones"].get(k), reporte["restricciones"].get(k))
        for k in {*config["restricciones"], *reporte["restricciones"]}
        if config["restricciones"].get(k) != reporte["restricciones"].get(k)
    }

    assert diferencias == {"stack_memory_limit_gb": (30, 24), "llm_budget_gb": (21, 16)}


def test_fase_a_el_protocolo_y_la_recuperacion_del_yaml_coinciden_con_los_del_reporte_medido() -> None:
    config = yaml.safe_load(CONFIG_FASE_A.read_text(encoding="utf-8"))
    reporte = json.loads(REPORTE_FASE_A.read_text(encoding="utf-8"))

    assert (config["protocolo"], config["recuperacion"]) == (reporte["protocolo"], reporte["recuperacion"])
