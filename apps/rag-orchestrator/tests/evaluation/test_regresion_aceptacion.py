"""Aceptación del umbral de regresión de la CI (US-074 AC-4, AC-5): el reporte frente a ``regression.yaml``."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.evaluation.comparar_regresion import main
from app.evaluation.regresion import AVISO_SIN_BASELINE
from tests.evaluation.conftest import RAIZ_APP

REGRESION_VERSIONADA = RAIZ_APP / "eval" / "configs" / "regression.yaml"


def reporte_con_recall(tmp_path: Path, recall_at_10: float | None) -> Path:
    validacion = {"preguntas_validadas": 0, "preguntas_no_validadas": 4, "rotulo": "no_validada"}
    recuperacion = {"recall_at_10": recall_at_10, "mrr": 1.0, "n": 4}
    reporte = {
        "metricas": {
            "completa": {"recuperacion": {"total": recuperacion, "validacion": validacion}},
            "revisada": {},
        }
    }
    archivo = tmp_path / "reporte.json"
    archivo.write_text(json.dumps(reporte), encoding="utf-8")
    return archivo


def umbrales(tmp_path: Path, contenido: str) -> Path:
    archivo = tmp_path / "regression.yaml"
    archivo.write_text(contenido, encoding="utf-8")
    return archivo


def comparar(reporte: Path, config: Path) -> int:
    return main(["--reporte", str(reporte), "--config", str(config)])


@pytest.mark.ac("US-074", 4)
def test_comparar_con_regression_yaml_versionado_sin_umbrales_pasa_con_aviso(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    codigo = comparar(reporte_con_recall(tmp_path, 0.5), REGRESION_VERSIONADA)

    salida = capsys.readouterr()
    assert (codigo, AVISO_SIN_BASELINE in salida.out) == (0, True)


@pytest.mark.ac("US-074", 5)
def test_comparar_con_recall_bajo_el_minimo_falla_nombrando_recall_at_10(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    config = umbrales(tmp_path, "recall_at_10_min: 0.80\n")

    codigo = comparar(reporte_con_recall(tmp_path, 0.5), config)

    salida = capsys.readouterr()
    assert codigo == 1
    assert "recall_at_10" in salida.err
    assert AVISO_SIN_BASELINE not in salida.out
