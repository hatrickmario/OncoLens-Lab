"""``s5-calibracion.yaml`` carga y corre con el corpus ampliado de 53 documentos y adaptadores falsos (S7.5, D6-37).

La configuración real usa ``proveedor: local``; aquí solo se sustituyen los adaptadores (falsos, reloj simulado, sin juez ni
URLs) y el resto —dataset, umbrales, grillas, catálogo— es el versionado. ``RERANKER_MAX_PAIRS=20`` llega por el entorno,
como en la corrida base, porque es un parámetro de ADR-39 (``modelos.env``) y no de la configuración de la suite.
"""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml

from app.evaluation.config_suite import cargar_config_suite
from app.evaluation.evaluate import main
from app.evaluation.fuente_dataset import FuenteDatasetEnDirectorio
from tests.evaluation.conftest import RAIZ_APP
from tests.support.fakes import RelojFijo

S5 = RAIZ_APP / "eval" / "configs" / "s5-calibracion.yaml"
ENTORNO_DE_LA_CORRIDA_BASE = {"RERANKER_MAX_PAIRS": "20"}
CORPUS_AMPLIADO = 53


def _s5_con_adaptadores_falsos(destino: Path) -> Path:
    crudo = yaml.safe_load(S5.read_text(encoding="utf-8"))
    crudo["adaptadores"] = {"proveedor": "fake"}
    crudo["modelos"] = {"llm": "fake-guion@1"}
    crudo["medicion"] = {"reloj": "simulado", "p95_corridas": crudo["medicion"]["p95_corridas"]}
    crudo.pop("juez", None)
    ruta = destino / "s5-falso.yaml"
    ruta.write_text(yaml.safe_dump(crudo), encoding="utf-8")
    return ruta


def test_la_configuracion_s5_apunta_a_un_corpus_de_53_documentos_y_no_fija_el_tope_de_pares_del_reranker() -> (
    None
):
    config = cargar_config_suite(S5)
    dataset = FuenteDatasetEnDirectorio(config.dataset).cargar()

    assert len(dataset.documentos) == CORPUS_AMPLIADO
    assert "reranker_max_pairs" not in S5.read_text(encoding="utf-8").casefold()


@pytest.mark.parametrize(
    "parametro", ["relevance_threshold", "nli_entailment_threshold", "retrieval_top_k"]
)
def test_los_barridos_de_la_calibracion_s5_corren_con_el_corpus_ampliado_y_adaptadores_falsos(
    tmp_path: Path, parametro: str
) -> None:
    config = _s5_con_adaptadores_falsos(tmp_path)

    codigo = main(
        ["--config", str(config), "--sweep", parametro, "--salida", str(tmp_path / parametro)],
        reloj=RelojFijo(),
        entorno=ENTORNO_DE_LA_CORRIDA_BASE,
        directorio_de_configs=tmp_path,
    )

    assert codigo == 0
    assert any((tmp_path / parametro).glob("*.md"))


def test_el_baseline_de_la_calibracion_s5_corre_con_el_corpus_ampliado_y_adaptadores_falsos(
    tmp_path: Path,
) -> None:
    config = _s5_con_adaptadores_falsos(tmp_path)

    codigo = main(
        ["--config", str(config), "--salida", str(tmp_path / "base")],
        reloj=RelojFijo(),
        entorno=ENTORNO_DE_LA_CORRIDA_BASE,
        directorio_de_configs=tmp_path,
    )

    assert codigo == 0
    assert list((tmp_path / "base").glob("*.json"))
