"""Configuración de la medición de US-236 (L1D-287 tarea 4.1): el runner la carga en seco, sin LLM ni red."""

from pathlib import Path

import yaml

from app.evaluation.config_suite import cargar_config_suite

CONFIG = Path(__file__).resolve().parents[2] / "eval" / "configs" / "us236-alias.yaml"


def test_la_configuracion_us236_se_carga_en_seco_con_el_llm_local_y_las_corridas_del_origen():
    config = cargar_config_suite(CONFIG)
    crudo = yaml.safe_load(CONFIG.read_text(encoding="utf-8"))

    assert (config.nombre, config.proveedor) == ("us236-alias", "local")
    assert config.urls["llm"].startswith("http://localhost")  # RN-12: solo el LLM local
    assert crudo["origen"]["EVAL_ORIGIN_RUNS"] == 10
    assert crudo["origen"]["pregunta"] == "¿Cuándo se considera un inhibidor de CDK4/6 adyuvante?"
