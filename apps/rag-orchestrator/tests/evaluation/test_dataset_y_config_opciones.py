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


def test_dataset_marca_revision_provisional_en_op_01_op_02_op_07_y_op_08_sin_validar_ninguno() -> (
    None
):
    dataset = cargar_dataset_opciones(DATASET)

    assert dataset.con_revision_provisional == frozenset({"OP-01", "OP-02", "OP-07", "OP-08"})
    assert dataset.base.revisadas == frozenset()


@pytest.mark.ac("US-140", 1)
def test_dataset_no_trae_ninguna_pregunta_con_el_texto_literal_en_ingles_de_su_cita() -> None:
    dataset = cargar_dataset_opciones(DATASET)

    for pregunta in dataset.base.preguntas:
        assert pregunta.idioma == "es", pregunta.id
        for evidencia in pregunta.evidencia:
            assert evidencia.cita.lower() not in pregunta.texto.lower(), pregunta.id


def test_dataset_op_08_trae_la_fuente_sensible_a_castracion_y_deja_la_resistente_al_final() -> None:
    dataset = cargar_dataset_opciones(DATASET)

    caso = dataset.caso_de("OP-08")

    assert set(caso.esperadas) == {"doc-p1", "doc-p5", "doc-p2"}
    assert caso.no_comparable_mostrada and caso.orden_esperado[-1] == "doc-p2"
    poblacion = dataset.poblaciones["doc-p5"].population_criteria
    assert poblacion["estado_castracion"] == "sensible a castración"


def test_dataset_rechaza_revision_provisional_con_rol_de_oncologo_nombrando_el_caso(
    tmp_path: Path,
) -> None:
    copia = tmp_path / "opciones"
    shutil.copytree(DATASET, copia)
    ruta = copia / "preguntas.yaml"
    crudo = yaml.safe_load(ruta.read_text(encoding="utf-8"))
    crudo["preguntas"][0]["revision_provisional"] = {"rol": "oncologo", "fecha": "2026-11-21"}
    ruta.write_text(yaml.safe_dump(crudo, allow_unicode=True), encoding="utf-8")

    with pytest.raises(DatasetInvalido, match="OP-01"):
        cargar_dataset_opciones(copia)


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


def test_config_s5_usa_los_umbrales_actuales_de_local_y_el_corpus_del_dataset_de_opciones() -> None:
    """S7.2 (``[S7 resp. 10]`` y ``[S7 resp. 11]``): la base no usa los umbrales calibrados de l1d-119 ni su corpus."""
    s5, local = cargar(LOCAL).suite, cargar_config_suite(CONFIGS / "local.yaml", {})

    assert s5.umbrales == local.umbrales
    assert s5.dataset == DATASET


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
