"""Identidad del modelo para ``meta`` (US-231a AC-3): función pura, formato ``<modelo>@<revisión>#sha256:<hash>``."""

import pytest

from app.domain.modelos import describir_modelo


def test_describir_modelo_une_modelo_revision_y_hash() -> None:
    assert (
        describir_modelo("org/modelo", "abc123", "f" * 64) == f"org/modelo@abc123#sha256:{'f' * 64}"
    )


def test_describir_modelo_normaliza_el_hash_a_minusculas() -> None:
    assert describir_modelo("m", "r", "AB" * 32).endswith("#sha256:" + "ab" * 32)


@pytest.mark.parametrize("campo", [("", "r", "a"), ("m", "", "a"), ("m", "r", "")])
def test_describir_modelo_rechaza_un_componente_vacio(campo: tuple[str, str, str]) -> None:
    with pytest.raises(ValueError):
        describir_modelo(*campo)
