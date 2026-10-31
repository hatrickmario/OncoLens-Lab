"""ConfigModelos (ADR-39) es un submodelo opcional de Settings: una sola fuente de configuración (RN-22)."""

from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import ValidationError

from app.config.modelos import CLAVES_ADR39
from app.config.settings import Settings
from app.evaluation.chequeo_config import leer_env

ENV_EXAMPLE = Path(__file__).resolve().parents[2] / ".env.example"


@pytest.fixture(autouse=True)
def _sin_claves_de_modelos(monkeypatch: pytest.MonkeyPatch) -> None:
    for clave in CLAVES_ADR39:
        monkeypatch.delenv(clave, raising=False)


def _cargar_claves_del_env_example(monkeypatch: pytest.MonkeyPatch) -> dict[str, str]:
    valores = leer_env(ENV_EXAMPLE.read_text(encoding="utf-8"))
    claves = {k: v for k, v in valores.items() if k in CLAVES_ADR39}
    for clave, valor in claves.items():
        monkeypatch.setenv(clave, valor)
    return claves


def test_settings_sin_claves_de_medicion_arranca_con_modelos_en_none() -> None:
    assert Settings(_env_file=None).modelos is None


def test_settings_con_las_claves_de_adr39_expone_la_configuracion_tipada(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    claves = _cargar_claves_del_env_example(monkeypatch)

    modelos = Settings(_env_file=None).modelos

    assert modelos is not None
    assert modelos.embedding_dim == int(
        claves["EMBEDDING_DIM"]
    ) and modelos.reranker_max_pairs == int(claves["RERANKER_MAX_PAIRS"])


def test_settings_con_claves_de_modelos_incompletas_falla_nombrando_las_que_faltan(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("EMBEDDING_MODEL", "org/modelo")

    with pytest.raises(ValidationError, match="EMBEDDING_DIM: falta"):
        Settings(_env_file=None)


def test_settings_cc_by_nc_esta_desactivado_por_defecto(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("ALLOW_CC_BY_NC", raising=False)

    assert Settings(_env_file=None).allow_cc_by_nc is False


def test_settings_cc_by_nc_se_activa_desde_el_entorno(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ALLOW_CC_BY_NC", "true")

    assert Settings(_env_file=None).allow_cc_by_nc is True
