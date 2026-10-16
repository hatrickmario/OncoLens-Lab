"""La configuración de la fase A es el registro histórico de lo que se midió: debe coincidir con su reporte."""

from __future__ import annotations

import json

import yaml

from tests.evaluation.conftest import RAIZ_APP, RAIZ_REPO

CONFIG_FASE_A = RAIZ_APP / "eval" / "configs" / "adr39-fase-a.yaml"
REPORTE_FASE_A = RAIZ_REPO / "reports" / "adr39" / "2026-10-16-fase-a.json"


def test_fase_a_las_restricciones_del_yaml_coinciden_con_las_del_reporte_medido() -> None:
    config = yaml.safe_load(CONFIG_FASE_A.read_text(encoding="utf-8"))
    reporte = json.loads(REPORTE_FASE_A.read_text(encoding="utf-8"))

    # El reporte del 2026-10-16 nombra la clave como se llamaba entonces (llm_budget_gb); hoy es llm_memory_budget_gb.
    historicas = {("llm_memory_budget_gb" if k == "llm_budget_gb" else k): v for k, v in reporte["restricciones"].items()}
    assert config["restricciones"] == historicas


def test_fase_a_el_protocolo_y_la_recuperacion_del_yaml_coinciden_con_los_del_reporte_medido() -> None:
    config = yaml.safe_load(CONFIG_FASE_A.read_text(encoding="utf-8"))
    reporte = json.loads(REPORTE_FASE_A.read_text(encoding="utf-8"))

    assert (config["protocolo"], config["recuperacion"]) == (reporte["protocolo"], reporte["recuperacion"])
