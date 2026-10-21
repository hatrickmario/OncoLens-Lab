"""Aceptación del runner `evaluate` con FX-T5a-a (US-072a): reporte, reproducibilidad, rótulo y datos sintéticos."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.evaluation.evaluate import main
from tests.evaluation.conftest import RAIZ_APP
from tests.support.fakes import RelojFijo

CONFIG = RAIZ_APP / "eval" / "configs" / "test-fake.yaml"
ETAPAS = {"idioma", "catalogo", "embeddings", "busqueda", "reranker", "generacion", "nli", "consulta"}


def correr(salida: Path, *extra: str, config: Path = CONFIG) -> int:
    return main(
        ["--config", str(config), "--suite", "all", "--report", "json", "--salida", str(salida), *extra],
        reloj=RelojFijo(),
    )


@pytest.mark.ac("US-072", 1)
def test_evaluate_con_fx_t5a_a_escribe_el_reporte_con_metricas_y_configuracion(
    tmp_path: Path,
) -> None:
    codigo = correr(tmp_path)

    archivos = list(tmp_path.glob("*.json"))
    assert (codigo, len(archivos)) == (0, 1)
    reporte = json.loads(archivos[0].read_text(encoding="utf-8"))
    configuracion = reporte["configuracion"]
    assert archivos[0].name == f"2026-10-16-{configuracion['hashConfig']}.json"
    completa = reporte["metricas"]["completa"]
    assert completa["recuperacion"]["total"]["n"] == 4
    assert completa["recuperacion"]["es_a_en"]["n"] == 2
    assert completa["recuperacion"]["total"]["recall_at_10"] is not None
    assert completa["citas"]["precision"] == pytest.approx(3 / 4)
    assert completa["sin_evidencia"]["exactitud"] == 1.0
    assert completa["opciones_con_cita_y_soporte"]["porcentaje"] == pytest.approx(3 / 5)
    assert set(reporte["latencia_p95_ms"]) == ETAPAS
    assert {"modelos", "promptVersion", "umbrales", "corpusRelease", "catalogVersion"} <= set(
        configuracion
    )
