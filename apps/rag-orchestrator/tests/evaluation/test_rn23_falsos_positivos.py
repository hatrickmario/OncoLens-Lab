"""Regresión de falsos positivos del filtro de RN-23 (US-249 AC-5): `rechazos_legitimos` con la lista 1.5.0 y la vigente.

La lista 1.5.0 es la línea base de US-068 (copia fija en ``data/eval/fx-rn23/linea-base/``). Las salidas ``legitima: true``
describen lo que dice la evidencia sin dirigirse al paciente; el filtro no debe rechazar más que la línea base.
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import Any

import pytest
import yaml

from app.evaluation.config_suite import ConfigInvalida, cargar_config_suite
from app.evaluation.evaluate import main
from tests.evaluation.conftest import RAIZ_APP, RAIZ_REPO
from tests.support.fakes import RelojFijo

CONFIG = RAIZ_APP / "eval" / "configs" / "rn23-fake.yaml"
FX = RAIZ_REPO / "data" / "eval" / "fx-rn23"
CLAVE = "rn23_tolerancia_falsos_positivos"


def _correr(salida: Path, config: Path = CONFIG) -> tuple[int, dict[str, Any] | None]:
    codigo = main(
        ["--config", str(config), "--suite", "all", "--salida", str(salida)], reloj=RelojFijo()
    )
    reportes = list(salida.glob("*.json"))
    return codigo, (json.loads(reportes[0].read_text(encoding="utf-8")) if reportes else None)


def _config_con(tmp_path: Path, dataset: Path | None = None, sin_clave: bool = False) -> Path:
    crudo = yaml.safe_load(CONFIG.read_text(encoding="utf-8"))
    if dataset is not None:
        crudo["dataset"]["ruta"] = str(dataset)
    if sin_clave:
        crudo.pop(CLAVE)
    ruta = tmp_path / "config.yaml"
    ruta.write_text(yaml.safe_dump(crudo), encoding="utf-8")
    return ruta


def _fx_con_el_legitimo_alterado(tmp_path: Path, texto: str) -> Path:
    dataset = tmp_path / "fx"
    shutil.copytree(FX, dataset)
    propuestas = yaml.safe_load((dataset / "propuestas.yaml").read_text(encoding="utf-8"))
    propuestas["propuestas"]["RN23-12"][0]["justificacion"] = texto
    (dataset / "propuestas.yaml").write_text(yaml.safe_dump(propuestas), encoding="utf-8")
    return dataset


@pytest.mark.ac("US-249", 5)
def test_evaluate_reporta_los_rechazos_legitimos_con_1_5_0_y_con_la_vigente_y_la_tolerancia_cuando_no_hay_regresion(
    tmp_path: Path,
) -> None:
    codigo, reporte = _correr(tmp_path)

    assert codigo == 0 and reporte is not None
    assert reporte["rechazos_legitimos"] == {
        "salidas_legitimas": 5,
        "con_la_lista_1_5_0": 0,
        "con_la_lista_vigente": 0,
        "diferencia": 0,
        "tolerancia": 0,
    }


@pytest.mark.ac("US-249", 5)
def test_evaluate_termina_distinto_de_cero_y_nombra_el_caso_y_la_regla_sin_el_texto_cuando_un_legitimo_nuevo_supera_la_tolerancia(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    texto = "Los autores recomiendan formalmente terapia anti-HER2 adyuvante."
    dataset = _fx_con_el_legitimo_alterado(tmp_path, texto)

    codigo, reporte = _correr(tmp_path / "s", _config_con(tmp_path, dataset))

    error = capsys.readouterr().err
    assert codigo == 4
    assert "RN23-12" in error and "b-recomiend" in error
    assert texto not in error and "recomiendan" not in error
    assert reporte is not None and reporte["rechazos_legitimos"]["diferencia"] == 1


@pytest.mark.ac("US-249", 5)
def test_evaluate_no_corre_y_nombra_la_clave_cuando_falta_rn23_tolerancia_falsos_positivos(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    codigo, reporte = _correr(tmp_path / "s", _config_con(tmp_path, sin_clave=True))

    assert codigo == 2 and reporte is None
    assert CLAVE in capsys.readouterr().err


def test_la_tolerancia_es_un_entero_no_negativo_sin_valor_por_defecto_en_codigo(
    tmp_path: Path,
) -> None:
    for invalido in (-1, "uno", 0.5, True):
        crudo = yaml.safe_load(CONFIG.read_text(encoding="utf-8"))
        crudo[CLAVE] = invalido
        ruta = tmp_path / "c.yaml"
        ruta.write_text(yaml.safe_dump(crudo), encoding="utf-8")
        with pytest.raises(ConfigInvalida, match=CLAVE):
            cargar_config_suite(ruta)

    assert cargar_config_suite(CONFIG).rn23_tolerancia_falsos_positivos == 0
    crudo = yaml.safe_load(CONFIG.read_text(encoding="utf-8"))
    crudo.pop(CLAVE)
    (tmp_path / "sin.yaml").write_text(yaml.safe_dump(crudo), encoding="utf-8")
    assert cargar_config_suite(tmp_path / "sin.yaml").rn23_tolerancia_falsos_positivos is None


def test_evaluate_no_pide_la_tolerancia_ni_reporta_rechazos_cuando_el_dataset_no_tiene_salidas_legitimas(
    tmp_path: Path,
) -> None:
    """test-fake mide FX-T5a-a, sin `legitima: true`: no lleva la clave y su reporte (y su baseline) no cambian."""
    codigo, reporte = _correr(tmp_path, RAIZ_APP / "eval" / "configs" / "test-fake.yaml")

    assert codigo == 0 and reporte is not None
    assert "rechazos_legitimos" not in reporte
