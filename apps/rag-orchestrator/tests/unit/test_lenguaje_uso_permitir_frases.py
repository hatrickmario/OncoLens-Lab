"""Guarda estructural de RN-23: la salida generada nunca se verifica con ``permitir_frases=True``."""

from __future__ import annotations

import re
from pathlib import Path

import pytest

APP = Path(__file__).resolve().parents[2] / "app"
PERMITIR_FRASES_ACTIVO = re.compile(r"permitir_frases\s*=\s*True")


@pytest.mark.ac("US-068", 5)
def test_ningun_modulo_de_app_usa_permitir_frases_activo() -> None:
    archivos = sorted(p for p in APP.rglob("*.py") if "tests" not in p.relative_to(APP).parts)
    assert archivos, "no se encontró código en app/"

    infractores = [
        str(p.relative_to(APP))
        for p in archivos
        if PERMITIR_FRASES_ACTIVO.search(p.read_text(encoding="utf-8"))
    ]

    assert infractores == []
