"""Enlaces entre ``METRICAS_CON_MINIMO``, el esquema del reporte, el reporte de la CI y el baseline versionado (US-074)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from app.evaluation.esquema_suite import ESQUEMA_SUITE
from app.evaluation.evaluate import main as evaluar
from app.evaluation.regresion import (
    METRICAS_CON_MINIMO,
    SECCION_DEL_MINIMO,
    cargar_minimos,
)
from app.evaluation.reporte import Numero, Objeto
from tests.evaluation.conftest import RAIZ_APP, RAIZ_REPO
from tests.support.fakes import RelojFijo

CONFIG_CI = RAIZ_APP / "eval" / "configs" / "test-fake.yaml"
REGRESSION = RAIZ_APP / "eval" / "configs" / "regression.yaml"
BASELINE = RAIZ_REPO / "data" / "evaluation" / "baseline.json"


def tipo_en_el_esquema(ruta: tuple[str, ...]) -> object:
    nodo: object = ESQUEMA_SUITE.campos["metricas"].campos[SECCION_DEL_MINIMO]
    for clave in ruta:
        assert isinstance(nodo, Objeto), f"{ruta}: no es un objeto en el esquema"
        nodo = nodo.campos[clave]
    return nodo


def valor_en(reporte: dict[str, Any], ruta: tuple[str, ...]) -> object:
    nodo: Any = reporte["metricas"][SECCION_DEL_MINIMO]
    for clave in ruta:
        nodo = nodo[clave]
    return nodo


@pytest.mark.parametrize("metrica", sorted(METRICAS_CON_MINIMO))
def test_toda_ruta_de_metricas_con_minimo_es_un_numero_del_esquema_del_reporte(
    metrica: str,
) -> None:
    assert isinstance(tipo_en_el_esquema(METRICAS_CON_MINIMO[metrica]), Numero)


def test_toda_ruta_de_metricas_con_minimo_existe_en_el_reporte_de_la_ci(tmp_path: Path) -> None:
    codigo = evaluar(
        ["--config", str(CONFIG_CI), "--suite", "all", "--salida", str(tmp_path)],
        reloj=RelojFijo(),
    )
    reporte = json.loads(next(tmp_path.glob("*.json")).read_text(encoding="utf-8"))

    valores = {m: valor_en(reporte, ruta) for m, ruta in METRICAS_CON_MINIMO.items()}

    assert (codigo, all(isinstance(v, int | float) for v in valores.values())) == (0, True)


def test_ningun_minimo_de_regression_yaml_supera_el_valor_del_baseline() -> None:
    baseline = json.loads(BASELINE.read_text(encoding="utf-8"))

    por_encima = [
        metrica
        for metrica, minimo in cargar_minimos(REGRESSION).items()
        if minimo > valor_en(baseline, METRICAS_CON_MINIMO[metrica])  # type: ignore[operator]
    ]

    assert por_encima == []
