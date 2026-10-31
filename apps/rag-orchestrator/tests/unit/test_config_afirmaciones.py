"""Claves de las afirmaciones atómicas en la configuración validada (US-245, RN-22)."""

import pytest
from pydantic import ValidationError

from app.config.settings import Settings


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
