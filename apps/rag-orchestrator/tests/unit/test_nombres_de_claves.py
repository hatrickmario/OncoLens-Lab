"""`configKeys` son las claves realmente cargadas (definidas), como en clinical-api (US-037 AC-1)."""

import pytest

from app.config.settings import Settings, nombres_de_claves


@pytest.mark.ac("US-037", 1)
def test_nombres_de_claves_no_incluye_una_clave_sin_definir_y_si_la_definida():
    sin_definir = Settings(_env_file=None, llm_provider="fake")
    definida = Settings(_env_file=None, llm_provider="fake", relevance_threshold=0.4)

    assert "RELEVANCE_THRESHOLD" not in nombres_de_claves(sin_definir)
    assert "RELEVANCE_THRESHOLD" in nombres_de_claves(definida)


def test_nombres_de_claves_incluye_las_definidas_aunque_el_valor_coincida_con_el_defecto():
    settings = Settings(_env_file=None, llm_provider="fake", llm_cloud_enabled=False)

    assert "LLM_CLOUD_ENABLED" in nombres_de_claves(settings)
    assert nombres_de_claves(settings) == sorted(nombres_de_claves(settings))


def test_nombres_de_claves_nunca_incluye_modelos_que_no_es_una_variable_de_entorno():
    assert "MODELOS" not in nombres_de_claves(Settings(_env_file=None, llm_provider="fake"))
