"""Unitarios de la comparación de regresión (US-074): reglas puras sin E/S salvo el YAML temporal."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest

from app.evaluation.regresion import (
    EntradaInvalida,
    Incumplimiento,
    cargar_umbrales,
    comparar_con_regresion,
)
from tests.evaluation.conftest import RAIZ_APP

REGRESION_VERSIONADA = RAIZ_APP / "eval" / "configs" / "regression.yaml"


def reporte(recall: float | None, mrr: float = 1.0) -> dict[str, Any]:
    total = {"recall_at_10": recall, "mrr": mrr}
    return {"metricas": {"completa": {"recuperacion": {"total": total}}}}


def test_sin_umbrales_no_aplica_ni_incumple() -> None:
    resultado = comparar_con_regresion(reporte(0.1), {})

    assert (resultado.aplicado, resultado.incumplimientos) == (False, ())


def test_metrica_igual_al_minimo_no_incumple() -> None:
    resultado = comparar_con_regresion(reporte(0.8), {"recall_at_10": 0.8})

    assert (resultado.aplicado, resultado.incumplimientos) == (True, ())


def test_metrica_nula_incumple_su_minimo_sin_tratarse_como_cero() -> None:
    resultado = comparar_con_regresion(reporte(None), {"recall_at_10": 0.8})

    assert resultado.incumplimientos == (Incumplimiento("recall_at_10", 0.8, None),)


def test_metrica_booleana_incumple_en_lugar_de_contar_como_uno() -> None:
    resultado = comparar_con_regresion(reporte(True), {"recall_at_10": 0.8})  # type: ignore[arg-type]

    assert resultado.incumplimientos == (Incumplimiento("recall_at_10", 0.8, None),)


def test_metrica_nan_incumple_en_lugar_de_pasar_la_comparacion() -> None:
    resultado = comparar_con_regresion(reporte(float("nan")), {"recall_at_10": 0.8})

    assert [i.metrica for i in resultado.incumplimientos] == ["recall_at_10"]


def test_nombra_solo_las_metricas_por_debajo_de_su_minimo() -> None:
    resultado = comparar_con_regresion(reporte(0.5, mrr=0.9), {"recall_at_10": 0.8, "mrr": 0.6})

    assert [i.metrica for i in resultado.incumplimientos] == ["recall_at_10"]


def test_cargar_umbrales_de_un_archivo_solo_con_comentarios_devuelve_vacio(tmp_path: Path) -> None:
    archivo = tmp_path / "regression.yaml"
    archivo.write_text("# sin umbrales\n", encoding="utf-8")

    assert cargar_umbrales(archivo) == {}


@pytest.mark.parametrize(
    "contenido", ["recall_min: 0.8\n", "mrr: 0.8\n", "mrr_min: 1.5\n", "- mrr_min\n"]
)
def test_cargar_umbrales_rechaza_claves_desconocidas_o_valores_fuera_de_rango(
    tmp_path: Path, contenido: str
) -> None:
    archivo = tmp_path / "regression.yaml"
    archivo.write_text(contenido, encoding="utf-8")

    with pytest.raises(EntradaInvalida):
        cargar_umbrales(archivo)


def test_comparar_con_reporte_sin_metricas_completas_lanza_entrada_invalida() -> None:
    with pytest.raises(EntradaInvalida):
        comparar_con_regresion({}, {"mrr": 0.5})


def test_regression_yaml_versionado_es_valido_para_cargar_umbrales() -> None:
    assert isinstance(cargar_umbrales(REGRESION_VERSIONADA), dict)
