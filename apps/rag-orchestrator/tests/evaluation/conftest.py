"""Configuración compartida de las pruebas de ``app.evaluation`` y ``app.scripts.adr39_*``."""

from __future__ import annotations

import shutil
import sys
from collections.abc import Iterator
from pathlib import Path

import pytest

from tests.evaluation.red_solo_loopback import RedSoloLoopback

RAIZ_APP = Path(__file__).resolve().parents[2]
RAIZ_REPO = RAIZ_APP.parents[1]
DATASET_REAL = RAIZ_REPO / "data" / "eval" / "adr39-mini"

if str(RAIZ_APP) not in sys.path:
    sys.path.insert(0, str(RAIZ_APP))


def pytest_configure(config: pytest.Config) -> None:
    config.addinivalue_line("markers", "ac(historia, numero): test de aceptación de un AC")


@pytest.fixture(autouse=True)
def red(monkeypatch: pytest.MonkeyPatch) -> Iterator[RedSoloLoopback]:
    """RN-12: durante toda la suite de evaluación solo se admite loopback; un intento fuera de él falla el test."""
    monitor = RedSoloLoopback(monkeypatch)
    yield monitor
    assert monitor.intentos == [], "la suite intentó una conexión fuera de loopback (RN-12)"


@pytest.fixture()
def dataset_dir(tmp_path: Path) -> Path:
    """Copia editable del mini-dataset real para mutarla en cada test."""
    destino = tmp_path / "adr39-mini"
    shutil.copytree(DATASET_REAL, destino)
    return destino
