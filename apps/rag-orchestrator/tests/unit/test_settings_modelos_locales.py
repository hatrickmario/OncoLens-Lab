"""Configuración de los modelos locales de recuperación (US-231a, RN-22, RN-12)."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.config.modelos import CLAVES_ADR39
from app.config.settings import Settings

SHA = "a" * 64


@pytest.fixture(autouse=True)
def _entorno_limpio(monkeypatch: pytest.MonkeyPatch) -> None:
    for clave in (
        *CLAVES_ADR39,
        "MODEL_PROVIDER",
        "DEFAULT_QUERY_LANGUAGE",
        "EMBEDDING_MODEL_SHA256",
        "RERANKER_MODEL_PATH",
    ):
        monkeypatch.delenv(clave, raising=False)


def test_settings_toma_fake_como_proveedor_de_modelos_cuando_no_se_define() -> None:
    assert Settings(_env_file=None).model_provider == "fake"


@pytest.mark.parametrize("valor", ["fake", "local"])
def test_settings_acepta_los_dos_valores_del_enum(
    monkeypatch: pytest.MonkeyPatch, valor: str
) -> None:
    monkeypatch.setenv("MODEL_PROVIDER", valor)

    assert Settings(_env_file=None).model_provider == valor


@pytest.mark.parametrize("valor", ["nube-secreta", "Local", "", "x local"])
def test_settings_rechaza_otro_valor_nombrando_model_provider_sin_eco(
    monkeypatch: pytest.MonkeyPatch, valor: str
) -> None:
    monkeypatch.setenv("MODEL_PROVIDER", valor)

    with pytest.raises(ValidationError) as error:
        Settings(_env_file=None)

    assert "MODEL_PROVIDER" in str(error.value)
    assert "input_value" not in str(error.value)


def test_settings_toma_es_como_idioma_por_defecto_y_lo_toma_del_entorno(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    assert Settings(_env_file=None).default_query_language == "es"
    monkeypatch.setenv("DEFAULT_QUERY_LANGUAGE", "en")

    assert Settings(_env_file=None).default_query_language == "en"


def test_settings_trata_una_ruta_o_un_hash_vacio_como_ausente(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("RERANKER_MODEL_PATH", "")
    monkeypatch.setenv("EMBEDDING_MODEL_SHA256", "")

    ajustes = Settings(_env_file=None)

    assert ajustes.reranker_model_path is None and ajustes.embedding_model_sha256 is None


def test_settings_rechaza_un_sha256_mal_formado_nombrando_la_variable_sin_eco(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("EMBEDDING_MODEL_SHA256", "no-es-un-hash-secreto")

    with pytest.raises(ValidationError) as error:
        Settings(_env_file=None)

    assert "EMBEDDING_MODEL_SHA256" in str(error.value)
    assert "no-es-un-hash-secreto" not in str(error.value)


def test_settings_acepta_el_sha256_de_64_hexadecimales(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("EMBEDDING_MODEL_SHA256", SHA)

    assert Settings(_env_file=None).embedding_model_sha256 == SHA


def test_settings_con_clave_de_adr39_vacia_no_compone_la_configuracion_de_modelos(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("EMBEDDING_MODEL", "")

    assert Settings(_env_file=None).modelos is None
