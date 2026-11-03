"""Evaluación del seguimiento (US-218, OL-06): 4 casos sintéticos sobre ``ResponderSeguimiento`` de producción."""

import asyncio

import pytest

from app.evaluation.config_suite import cargar_config_suite
from app.evaluation.dataset_loader import DatasetInvalido
from app.evaluation.rutas import raiz_repo
from app.evaluation.seguimiento import DATASET_POR_DEFECTO, cargar_casos, evaluar

CONFIG = raiz_repo() / "apps/rag-orchestrator/eval/configs/test-fake.yaml"


def _reporte():
    dataset, casos = cargar_casos(raiz_repo() / DATASET_POR_DEFECTO)
    return asyncio.run(evaluar(cargar_config_suite(CONFIG), dataset, casos))


def test_evaluar_seguimiento_cumple_las_metas_y_rn_24_cuando_se_miden_los_cuatro_casos():
    reporte = _reporte()

    metricas = reporte["metricas"]
    assert reporte["casos"] == 4
    assert metricas["estados_correctos"] == 1.0
    assert metricas["fidelidad"] == 1.0 and metricas["precision_de_citas"] == 1.0
    assert metricas["sin_evidencia"] == 1.0
    assert metricas["salidas_prescriptivas"] == 0
    assert metricas["memoria_como_soporte"] == 0


def test_evaluar_seguimiento_omite_la_afirmacion_de_la_memoria_cuando_el_caso_la_copia():
    por_caso = {c["id"]: c for c in _reporte()["por_caso"]}

    assert por_caso["SEG-MEM-04"]["correcto"] is True


def test_cargar_casos_rechaza_un_dataset_que_no_es_sintetico(tmp_path):
    (tmp_path / "manifest.yaml").write_text(
        "clase: real_anonimizado\narchivos: {casos: seguimiento.yaml}\n", encoding="utf-8"
    )
    (tmp_path / "seguimiento.yaml").write_text(
        "clase: real_anonimizado\ncorpus: fx-t5a-a\ncasos: []\n", encoding="utf-8"
    )

    with pytest.raises(DatasetInvalido):
        cargar_casos(tmp_path)
