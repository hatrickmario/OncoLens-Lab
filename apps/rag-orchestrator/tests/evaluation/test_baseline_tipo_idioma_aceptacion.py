"""Aceptación del baseline por tipo de cáncer e idioma y de la mediana del p95 (US-120 AC-6, M-06.1, M-06.2, RN-14, RN-22),
con FX-T5a-a y adapters falsos; el baseline con modelos locales es la corrida nocturna (D5-08)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
import yaml

from app.evaluation.evaluate import main
from tests.evaluation.conftest import RAIZ_APP, RAIZ_REPO
from tests.support.fakes import RelojFijo

CONFIG = RAIZ_APP / "eval" / "configs" / "test-fake.yaml"
METRICAS = {
    "recall_at_10",
    "recall_at_10_es_a_en",
    "mrr",
    "fidelidad_proxy",
    "precision_citas",
    "sin_evidencia",
}
IDIOMAS = {"es", "en", "es_a_en"}
P95_CORRIDAS = 3


def config_de_baseline(tmp_path: Path) -> Path:
    crudo = yaml.safe_load(CONFIG.read_text(encoding="utf-8"))
    crudo["umbrales"]["relevance_threshold"] = 0.5
    crudo["barrido"] = {
        "relevance_threshold_grid": [0.2, 0.5, 0.9],
        "umbral_de_referencia": 0.5,
        "tolerancia_recall": 0.05,
    }
    crudo["medicion"]["p95_corridas"] = P95_CORRIDAS  # EVAL_P95_RUNS (RN-22)
    ruta = tmp_path / "config.yaml"
    ruta.write_text(yaml.safe_dump(crudo), encoding="utf-8")
    return ruta


def registrar_baseline(tmp_path: Path) -> tuple[dict[str, object], str]:
    config = config_de_baseline(tmp_path)
    codigo = main(
        [
            "--config",
            str(config),
            "--sweep",
            "relevance_threshold",
            "--salida",
            str(tmp_path / "s"),
        ],
        reloj=RelojFijo(),
        directorio_de_configs=tmp_path,
    )
    assert codigo == 0
    salida = tmp_path / "s"
    return (
        json.loads((salida / "S1-baseline.json").read_text(encoding="utf-8")),
        (salida / "S1-baseline.md").read_text(encoding="utf-8"),
    )


@pytest.mark.ac("US-120", 6)
def test_baseline_desagrega_las_metricas_por_tipo_e_idioma_y_reporta_la_mediana_del_p95_cuando_se_registra(
    tmp_path: Path,
) -> None:
    """[US-120 AC-6] El baseline trae las seis métricas por tipo de cáncer e idioma, marcadas frente a las metas, y el p95 como
    mediana de ``EVAL_P95_RUNS`` corridas; solo agregados."""
    reporte, informe = registrar_baseline(tmp_path)

    celdas = reporte.get("metricasPorTipoEIdioma")
    assert isinstance(celdas, dict) and set(celdas) == {"mama", "prostata"}
    for tipo in ("mama", "prostata"):
        assert set(celdas[tipo]) == IDIOMAS
        for idioma in IDIOMAS:
            assert set(celdas[tipo][idioma]) == METRICAS
    # a mano (FX-T5a-a): FX-01/FX-02 y FX-03 encuentran su cita; es→en es la pregunta en español contra el corpus en inglés
    assert celdas["mama"]["es_a_en"]["recall_at_10"] == 1.0
    assert celdas["mama"]["en"]["recall_at_10"] == 1.0
    assert celdas["prostata"]["es"]["recall_at_10"] == 1.0
    assert reporte.get("p95Corridas") == P95_CORRIDAS
    assert "mama · es→en · recall@10" in informe and "en meta" in informe
    contenido = informe + json.dumps(reporte, ensure_ascii=False)
    preguntas = (RAIZ_REPO / "data" / "eval" / "fx-t5a-a" / "preguntas.yaml").read_text("utf-8")
    textos = [p["pregunta"] for p in yaml.safe_load(preguntas)["preguntas"]]
    assert not any(texto in contenido for texto in textos)
