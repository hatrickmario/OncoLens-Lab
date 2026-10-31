"""Configuración de la medición de US-236 (L1D-287 tarea 4.1): el runner la carga en seco, sin LLM ni red.

La configuración cargada es la que consume la medición: ``parametros_de`` no admite literales fuera del YAML.
"""

from pathlib import Path

import pytest
import yaml

from app.config.settings import Settings
from app.evaluation.config_suite import ConfigInvalida, cargar_config_suite
from app.evaluation.medicion_alias import (
    CONFIG_POR_DEFECTO,
    con_ruido,
    generador_de,
    parametros_de,
)

CONFIG = Path(__file__).resolve().parents[2] / "eval" / "configs" / "us236-alias.yaml"


def test_la_configuracion_us236_se_carga_en_seco_con_el_llm_local():
    config = cargar_config_suite(CONFIG)

    assert (config.nombre, config.proveedor) == ("us236-alias", "local")
    assert config.urls["llm"].startswith("http://localhost")  # RN-12: solo el LLM local


def test_los_parametros_de_la_medicion_salen_de_la_configuracion_cargada():
    params = parametros_de(cargar_config_suite(CONFIG))

    assert params.modelo == "gemma4:26b-a4b-it-q4_K_M"
    assert params.url_llm == "http://localhost:11434/v1"
    assert params.pregunta_origen == "¿Cuándo se considera un inhibidor de CDK4/6 adyuvante?"
    assert params.corridas_origen == 10
    assert params.dataset.name == "adr39-mini"


def test_la_medicion_usa_por_defecto_la_configuracion_us236():
    assert CONFIG_POR_DEFECTO == Path("eval/configs/us236-alias.yaml")


def test_parametros_de_falla_sin_el_bloque_origen_cuando_la_url_del_llm_si_esta(tmp_path):
    crudo = yaml.safe_load(CONFIG.read_text(encoding="utf-8"))
    del crudo["origen"]
    sin_origen = tmp_path / "sin-origen.yaml"
    sin_origen.write_text(yaml.safe_dump(crudo, allow_unicode=True), encoding="utf-8")
    config = cargar_config_suite(sin_origen)
    assert config.urls["llm"]  # lo único que falta es el bloque origen

    with pytest.raises(ConfigInvalida):
        parametros_de(config)


def test_el_generador_de_la_medicion_hereda_los_valores_de_settings_salvo_url_y_modelo():
    params = parametros_de(cargar_config_suite(CONFIG))
    ajustes = Settings()

    generador = generador_de(params)

    assert generador._max_chars_fragmentos == ajustes.llm_fragments_max_chars
    assert generador._claims_min == ajustes.claims_min_per_option
    assert generador._claims_max == ajustes.claims_max_per_option
    assert generador._claim_max_words == ajustes.claim_max_words


def test_el_chunk_con_ruido_conserva_las_palabras_originales_y_agrega_latex():
    texto = " ".join(f"palabra{n}" for n in range(60))

    ruidoso = con_ruido(texto)

    assert "\\" in ruidoso and all(f"palabra{n}" in ruidoso for n in range(60))
