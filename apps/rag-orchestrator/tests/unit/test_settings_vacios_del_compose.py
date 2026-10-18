"""El Compose pasa ``${CLAVE:-}``: una clave vacía es una clave ausente y no un valor (RN-22, US-231a)."""

from __future__ import annotations

import pytest

from app.config.settings import Settings


@pytest.mark.parametrize("clave", ["NLI_MODEL", "PROMPT_VERSION"])
def test_una_etiqueta_de_meta_vacia_cuenta_como_ausente(
    monkeypatch: pytest.MonkeyPatch, clave: str
) -> None:
    monkeypatch.setenv(clave, "")

    ajustes = Settings(_env_file=None)  # type: ignore[call-arg]

    assert getattr(ajustes, clave.lower()) is None
