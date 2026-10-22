"""Aceptación del umbral de regresión de la CI (US-074 AC-4, AC-5): el reporte frente a ``regression.yaml``."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.evaluation.comparar_regresion import main
from app.evaluation.regresion import AVISO_SIN_MINIMOS
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
def test_comparar_con_regression_yaml_sin_umbrales_pasa_con_aviso(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    config = umbrales(tmp_path, "# sin umbrales\n")

    codigo = comparar(reporte_con_recall(tmp_path, 0.5), config)

    salida = capsys.readouterr()
    assert (codigo, AVISO_SIN_MINIMOS in salida.out) == (0, True)


@pytest.mark.ac("US-074", 5)
def test_comparar_con_recall_bajo_el_minimo_falla_nombrando_recall_at_10(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    config = umbrales(tmp_path, "recall_at_10_min: 0.80\n")

    codigo = comparar(reporte_con_recall(tmp_path, 0.5), config)

    salida = capsys.readouterr()
    assert codigo == 1
    assert "recall_at_10" in salida.err
    assert AVISO_SIN_MINIMOS not in salida.out


def test_comparar_con_reporte_ilegible_sale_con_2_sin_filtrar_su_contenido(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    reporte = tmp_path / "reporte.json"
    reporte.write_text('{"metricas": {}, "secreto": "texto-clinico"}', encoding="utf-8")

    codigo = comparar(reporte, REGRESION_VERSIONADA)

    salida = capsys.readouterr()
    assert (codigo, "texto-clinico" in salida.err + salida.out) == (2, False)


def test_comparar_con_umbral_desconocido_sale_con_2(tmp_path: Path) -> None:
    config = umbrales(tmp_path, "inventada_min: 0.5\n")

    assert comparar(reporte_con_recall(tmp_path, 0.9), config) == 2


@pytest.mark.ac("US-074", 5)
@pytest.mark.parametrize(
    ("bytes_config", "bytes_reporte"),
    [
        (b"mrr_min: 2024-02-30\n", b"{}"),
        (b"\xff\xfe mrr_min: 0.5\n", b"{}"),
        (b"# sin umbrales\n", b"[" * 100_000),
    ],
    ids=["fecha_imposible", "config_no_utf8", "reporte_anidado_profundo"],
)
def test_comparar_con_entrada_corrupta_sale_con_2_sin_traceback(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
    bytes_config: bytes,
    bytes_reporte: bytes,
) -> None:
    config = tmp_path / "regression.yaml"
    reporte = tmp_path / "reporte.json"
    config.write_bytes(bytes_config)
    reporte.write_bytes(bytes_reporte)

    codigo = comparar(reporte, config)

    salida = capsys.readouterr()
    assert (codigo, "Traceback" in salida.err + salida.out) == (2, False)


def test_comparar_con_clave_repetida_en_regression_yaml_sale_con_2(tmp_path: Path) -> None:
    config = umbrales(tmp_path, "recall_at_10_min: 0.8\nrecall_at_10_min: 0.1\n")

    assert comparar(reporte_con_recall(tmp_path, 0.5), config) == 2


def test_comparar_sin_argumentos_sale_con_2() -> None:
    assert main([]) == 2


def test_comparar_con_varias_metricas_bajas_las_nombra_todas(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    config = umbrales(tmp_path, "recall_at_10_min: 0.80\nmrr_min: 1.0\n")
    reporte = reporte_con_recall(tmp_path, 0.5)
    datos = json.loads(reporte.read_text(encoding="utf-8"))
    datos["metricas"]["completa"]["recuperacion"]["total"]["mrr"] = 0.4
    reporte.write_text(json.dumps(datos), encoding="utf-8")

    codigo = comparar(reporte, config)

    err = capsys.readouterr().err
    assert (codigo, "recall_at_10" in err, "mrr" in err) == (1, True, True)
