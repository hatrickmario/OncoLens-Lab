"""Claves de las afirmaciones atómicas en la configuración validada (US-245, RN-22)."""

import re

import pytest
from pydantic import ValidationError

from app.config.settings import Settings
from tests.support.contract import RAIZ_REPOSITORIO


def test_los_valores_por_defecto_son_de_1_a_4_afirmaciones_de_20_palabras() -> None:
    ajustes = Settings()

    assert (ajustes.claims_min_per_option, ajustes.claims_max_per_option) == (1, 4)
    assert ajustes.claim_max_words == 20


def test_las_claves_se_leen_del_entorno(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CLAIMS_MIN_PER_OPTION", "2")
    monkeypatch.setenv("CLAIMS_MAX_PER_OPTION", "3")
    monkeypatch.setenv("CLAIM_MAX_WORDS", "15")

    ajustes = Settings()

    assert (ajustes.claims_min_per_option, ajustes.claims_max_per_option) == (2, 3)
    assert ajustes.claim_max_words == 15


def test_falla_al_arrancar_cuando_el_minimo_supera_al_maximo(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("CLAIMS_MIN_PER_OPTION", "3")
    monkeypatch.setenv("CLAIMS_MAX_PER_OPTION", "2")

    with pytest.raises(ValidationError):
        Settings()


@pytest.mark.parametrize(
    "clave", ["CLAIMS_MIN_PER_OPTION", "CLAIMS_MAX_PER_OPTION", "CLAIM_MAX_WORDS"]
)
def test_falla_al_arrancar_cuando_una_clave_no_es_positiva(
    clave: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv(clave, "0")

    with pytest.raises(ValidationError):
        Settings()


@pytest.mark.parametrize(
    ("clave", "campo"),
    [
        ("CLAIMS_MIN_PER_OPTION", "claims_min_per_option"),
        ("CLAIMS_MAX_PER_OPTION", "claims_max_per_option"),
        ("CLAIM_MAX_WORDS", "claim_max_words"),
    ],
)
def test_el_valor_por_defecto_de_compose_es_el_de_settings(clave: str, campo: str) -> None:
    compose = (RAIZ_REPOSITORIO / "infra/docker/docker-compose.yml").read_text(encoding="utf-8")

    por_defecto = re.search(rf"^\s+{clave}: \$\{{{clave}:-(\d+)\}}$", compose, re.MULTILINE)

    assert por_defecto is not None
    assert int(por_defecto.group(1)) == getattr(Settings(), campo)
