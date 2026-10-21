"""Rótulo «validada» (AC-T5.3, US-072 AC-4): solo la métrica calculada sobre preguntas revisadas lo lleva."""

from __future__ import annotations

import json
import shutil
from pathlib import Path

import pytest
import yaml

from app.evaluation.evaluate import main
from app.evaluation.rotulo import Validacion, rotular_validada
from tests.evaluation.conftest import RAIZ_APP, RAIZ_REPO
from tests.support.fakes import RelojFijo

CONFIG = RAIZ_APP / "eval" / "configs" / "test-fake.yaml"
FAMILIAS = ("recuperacion", "citas", "sin_evidencia", "opciones_con_cita_y_soporte")


def dataset_con_revisadas(tmp_path: Path, total: int, revisadas: int) -> Path:
    """Copia de FX-T5a-a con ``total`` preguntas (las 6 de FX en ciclo) y las primeras ``revisadas`` revisadas."""
    destino = tmp_path / "fx"
    shutil.copytree(RAIZ_REPO / "data" / "eval" / "fx-t5a-a", destino)
    base = yaml.safe_load((destino / "preguntas.yaml").read_text(encoding="utf-8"))["preguntas"]
    preguntas = []
    for i in range(total):
        pregunta = dict(base[i % len(base)], id=f"FX-{i:03d}", revisada_por_oncologo=i < revisadas)
        pregunta.pop("control_de", None)
        preguntas.append(pregunta)
    (destino / "preguntas.yaml").write_text(
        yaml.safe_dump({"clase": "sintetico", "preguntas": preguntas}), encoding="utf-8"
    )
    return destino


def reporte_de(tmp_path: Path, dataset: Path) -> dict:
    crudo = yaml.safe_load(CONFIG.read_text(encoding="utf-8"))
    crudo["dataset"]["ruta"] = str(dataset)
    config = tmp_path / "config.yaml"
    config.write_text(yaml.safe_dump(crudo), encoding="utf-8")
    salida = tmp_path / "salida"
    assert main(["--config", str(config), "--salida", str(salida)], reloj=RelojFijo()) == 0
    return json.loads(next(salida.glob("*.json")).read_text(encoding="utf-8"))


def test_rotular_validada_exige_preguntas_revisadas_y_ninguna_sin_revisar() -> None:
    assert [rotular_validada(15, 0), rotular_validada(15, 5), rotular_validada(0, 0)] == [
        Validacion(15, 0, "validada"),
        Validacion(15, 5, "no_validada"),
        Validacion(0, 0, "no_validada"),
    ]


@pytest.mark.ac("US-072", 4)
def test_el_reporte_separa_validadas_de_no_validadas_y_solo_la_muestra_revisada_lleva_el_rotulo(
    tmp_path: Path,
) -> None:
    reporte = reporte_de(tmp_path, dataset_con_revisadas(tmp_path, total=20, revisadas=15))

    metricas = reporte["metricas"]
    assert {f: metricas["completa"][f].get("validacion") for f in FAMILIAS} == dict.fromkeys(
        FAMILIAS, {"preguntas_validadas": 15, "preguntas_no_validadas": 5, "rotulo": "no_validada"}
    )
    revisada = metricas.get("revisada", {})
    assert {f: revisada.get(f, {}).get("validacion") for f in FAMILIAS} == dict.fromkeys(
        FAMILIAS, {"preguntas_validadas": 15, "preguntas_no_validadas": 0, "rotulo": "validada"}
    )


@pytest.mark.ac("US-072", 4)
def test_sin_preguntas_revisadas_ninguna_metrica_lleva_el_rotulo_validada(tmp_path: Path) -> None:
    reporte = reporte_de(tmp_path, dataset_con_revisadas(tmp_path, total=6, revisadas=0))

    rotulos = {
        (muestra, f): reporte["metricas"].get(muestra, {}).get(f, {}).get("validacion")
        for muestra in ("completa", "revisada")
        for f in FAMILIAS
    }
    assert all(
        v is not None and v["rotulo"] == "no_validada" and v["preguntas_validadas"] == 0
        for v in rotulos.values()
    )
