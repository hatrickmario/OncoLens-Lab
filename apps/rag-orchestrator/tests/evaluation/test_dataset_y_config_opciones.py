"""Dataset sintético y configuraciones de la familia `opciones` (US-140; test después, datos y configuración)."""

from __future__ import annotations

import shutil
from pathlib import Path
from typing import Any

import pytest
import yaml

from app.evaluation.config_opciones import (
    ConfigOpciones,
    cargar_config_opciones,
    leer_referencia,
)
from app.evaluation.config_suite import ConfigInvalida, cargar_config_suite
from app.evaluation.dataset_loader import DatasetInvalido
from app.evaluation.dataset_opciones import (
    CASOS_CON_NO_COMPARABLE,
    CASOS_ESPERADOS,
    CASOS_POR_TIPO,
    cargar_dataset_opciones,
)
from tests.evaluation.conftest import RAIZ_APP, RAIZ_REPO

DATASET = RAIZ_REPO / "data" / "evaluation" / "opciones"
CONFIGS = RAIZ_APP / "eval" / "configs"
FALSA = CONFIGS / "opciones-fake.yaml"
LOCAL = CONFIGS / "s5.yaml"


def cargar(ruta: Path) -> ConfigOpciones:
    return cargar_config_opciones(ruta, cargar_config_suite(ruta, {}))


def con_cambio(tmp_path: Path, cambiar: Any) -> Path:
    crudo = yaml.safe_load(FALSA.read_text(encoding="utf-8"))
    cambiar(crudo)
    ruta = tmp_path / "config.yaml"
    ruta.write_text(yaml.safe_dump(crudo, allow_unicode=True), encoding="utf-8")
    return ruta


def test_dataset_trae_12_casos_6_por_tipo_ninguno_revisado_y_2_con_no_comparable() -> None:
    dataset = cargar_dataset_opciones(DATASET)

    preguntas = dataset.base.preguntas
    assert len(preguntas) == CASOS_ESPERADOS == len(dataset.casos)
    assert sum(p.cancer == "mama" for p in preguntas) == CASOS_POR_TIPO
    assert sum(p.cancer == "prostata" for p in preguntas) == CASOS_POR_TIPO
    assert (
        dataset.base.revisadas == frozenset()
    )  # nadie lo ha revisado: lo confirma el oncólogo (H-2)
    assert sum(c.no_comparable_mostrada for c in dataset.casos) == CASOS_CON_NO_COMPARABLE


def test_dataset_es_sintetico_y_no_lleva_identidad_en_los_contextos() -> None:
    dataset = cargar_dataset_opciones(DATASET)

    assert dataset.base.clase == "sintetico"
    assert all(c["pseudoPatientId"].startswith("psd_") for c in dataset.contextos.values())


def test_dataset_rechaza_un_caso_sin_pregunta(tmp_path: Path) -> None:
    copia = tmp_path / "opciones"
    shutil.copytree(DATASET, copia)
    ruta = copia / "casos.yaml"
    crudo = yaml.safe_load(ruta.read_text(encoding="utf-8"))
    del crudo["casos"]["OP-12"]
    ruta.write_text(yaml.safe_dump(crudo, allow_unicode=True), encoding="utf-8")

    with pytest.raises(DatasetInvalido):
        cargar_dataset_opciones(copia)


@pytest.mark.parametrize("ruta", [FALSA, LOCAL])
def test_config_carga_ambas_configuraciones_con_la_tolerancia_y_la_referencia(ruta: Path) -> None:
    config = cargar(ruta)

    assert config.max_options == 3
    assert config.faithfulness_regression_tolerance == 0.05
    assert config.reporte_de_referencia.is_file()
    assert set(leer_referencia(config.reporte_de_referencia).medidas) == {
        "fidelidad",
        "precision_citas",
    }


def test_config_falsa_usa_adapters_falsos_y_reloj_simulado_y_s5_usa_el_proveedor_local() -> None:
    falsa, local = cargar(FALSA).suite, cargar(LOCAL).suite

    assert (falsa.proveedor, falsa.reloj) == ("fake", "simulado")
    assert local.proveedor == "local"
    assert falsa.hash_config != local.hash_config


def test_config_rechaza_la_ausencia_de_la_referencia_nombrando_la_clave(tmp_path: Path) -> None:
    ruta = con_cambio(tmp_path, lambda crudo: crudo["regresion"].pop("reporte_referencia"))

    with pytest.raises(ConfigInvalida, match="regresion.reporte_referencia"):
        cargar(ruta)


def test_config_rechaza_la_ausencia_de_la_tolerancia_nombrando_la_clave(tmp_path: Path) -> None:
    ruta = con_cambio(
        tmp_path, lambda crudo: crudo["regresion"].pop("faithfulness_regression_tolerance")
    )

    with pytest.raises(ConfigInvalida, match="faithfulness_regression_tolerance"):
        cargar(ruta)


@pytest.mark.parametrize("valor", [0, 4, True])
def test_config_rechaza_max_options_fuera_de_1_a_3(tmp_path: Path, valor: object) -> None:
    ruta = con_cambio(tmp_path, lambda crudo: crudo["opciones"].update(maxOptions=valor))

    with pytest.raises(ConfigInvalida, match="maxOptions"):
        cargar(ruta)


def test_referencia_sin_fidelidad_no_se_lee(tmp_path: Path) -> None:
    ruta = tmp_path / "referencia.json"
    ruta.write_text('{"metricas": {"completa": {"citas": {"precision": 0.8}}}}', encoding="utf-8")

    with pytest.raises(ConfigInvalida, match="reporte_referencia"):
        leer_referencia(ruta)
