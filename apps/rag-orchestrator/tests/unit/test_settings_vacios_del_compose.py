"""El Compose pasa ``${CLAVE:-}``: una clave vacía es una clave ausente y no un valor (RN-22, US-231a)."""

from __future__ import annotations

import pytest

from app.config.settings import Settings


@pytest.mark.parametrize("clave", ["NLI_ENTAILMENT_THRESHOLD", "CLINICAL_CATALOG_PATH"])
def test_una_clave_de_la_etapa_de_soporte_vacia_cuenta_como_ausente(
    monkeypatch: pytest.MonkeyPatch, clave: str
) -> None:
    monkeypatch.setenv(clave, "")

    ajustes = Settings(_env_file=None)  # type: ignore[call-arg]

    assert getattr(ajustes, clave.lower()) is None
