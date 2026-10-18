"""Detector de idioma local y determinista (US-231a AC-4, ADR-39). No usa pesos: la misma prueba corre en la CI."""

from __future__ import annotations

import pytest

from app.infrastructure.language.detector_local import DetectorDeIdiomaLocal
from tests.support.inferencia_falsa import CH_M1_1, Q_HER2


@pytest.mark.ac("US-231a", 4)
def test_devuelve_es_para_q_her2_y_en_para_ch_m1_1() -> None:
    detector = DetectorDeIdiomaLocal("es")

    assert detector.detectar(Q_HER2) == "es"
    assert detector.detectar(CH_M1_1) == "en"
