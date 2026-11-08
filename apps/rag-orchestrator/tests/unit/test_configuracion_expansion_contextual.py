"""``QUERY_CONTEXT_EXPANSION_*`` desde el entorno (US-271 AC-7, ADR-52, RN-22): valores por defecto y lista separada por comas."""

import pytest

from app.config.settings import Settings


def _settings(monkeypatch, **entorno: str) -> Settings:
    for nombre in (
        "QUERY_CONTEXT_EXPANSION_ENABLED",
        "QUERY_CONTEXT_EXPANSION_FIELDS",
        "QUERY_CONTEXT_EXPANSION_RERANK_FORMAT",
    ):
        monkeypatch.delenv(nombre, raising=False)
    for nombre, valor in entorno.items():
        monkeypatch.setenv(nombre, valor)
    return Settings(_env_file=None)  # type: ignore[call-arg]


@pytest.mark.ac("US-275", 1)
def test_settings_activa_el_loop_contextual_y_usa_los_tres_campos_cuando_el_entorno_no_define_nada(
    monkeypatch,
):
    settings = _settings(monkeypatch)

    assert settings.query_context_expansion_enabled is True
    assert settings.retrieval_mode == "dense"
    assert settings.query_context_expansion_fields == ("tipo", "estadio", "biomarcador_principal")
    assert settings.query_context_expansion_rerank_format == "plano"


def test_settings_apaga_el_loop_contextual_cuando_el_entorno_lo_declara_false(monkeypatch):
    settings = _settings(monkeypatch, QUERY_CONTEXT_EXPANSION_ENABLED="false")

    assert settings.query_context_expansion_enabled is False


def test_settings_lee_la_lista_de_campos_separada_por_comas_cuando_viene_del_entorno(monkeypatch):
    settings = _settings(
        monkeypatch,
        QUERY_CONTEXT_EXPANSION_ENABLED="true",
        QUERY_CONTEXT_EXPANSION_FIELDS="tipo, estadio",
    )

    assert settings.query_context_expansion_enabled is True
    assert settings.query_context_expansion_fields == ("tipo", "estadio")
