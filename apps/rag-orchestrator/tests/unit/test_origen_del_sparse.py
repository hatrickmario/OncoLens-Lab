"""El origen del vector sparse (SPARSE_VECTOR_SOURCE) tiene una sola lista de valores admitidos (US-117a D3, ADR-39)."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.config.modelos import (
    CLAVES_ADR39,
    SPARSE_VECTOR_SOURCES_ADMITIDAS,
    ConfigInvalida,
    cargar_config_modelos,
)
from app.config.settings import CorpusIngestSettings
from app.evaluation.chequeo_config import leer_env

ENV_EXAMPLE = Path(__file__).resolve().parents[2] / ".env.example"
CLAVES_DE_LA_INGESTA = {
    "CORPUS_ACCEPTED_LICENSES": "dominio_publico",
    "CORPUS_EXCLUDED_SOURCES": "NCCN",
    "CORPUS_CUTOFF_DATE": "2026-10-16",
    "CORPUS_CHUNK_SIZE": "1024",
    "CORPUS_CHUNK_OVERLAP": "0",
    "EMBEDDING_SPARSE_WEIGHTS_PATH": "/models/sparse_linear.npz",
    "EMBEDDING_SPARSE_WEIGHTS_SHA256": "ab" * 32,
}


def _config_de_modelos(origen: str):
    base = leer_env(ENV_EXAMPLE.read_text(encoding="utf-8"))
    entorno = {k: v for k, v in base.items() if k in CLAVES_ADR39}
    return cargar_config_modelos({**entorno, "SPARSE_VECTOR_SOURCE": origen})


def _ajustes_de_ingesta(monkeypatch: pytest.MonkeyPatch, origen: str) -> CorpusIngestSettings:
    for clave, valor in {**CLAVES_DE_LA_INGESTA, "SPARSE_VECTOR_SOURCE": origen}.items():
        monkeypatch.setenv(clave, valor)
    return CorpusIngestSettings(_env_file=None)  # type: ignore[call-arg]


def test_el_unico_origen_admitido_es_modelo_embeddings() -> None:
    assert SPARSE_VECTOR_SOURCES_ADMITIDAS == ("modelo_embeddings",)


@pytest.mark.parametrize("origen", SPARSE_VECTOR_SOURCES_ADMITIDAS)
def test_las_dos_configuraciones_aceptan_los_origenes_admitidos(
    monkeypatch: pytest.MonkeyPatch, origen: str
) -> None:
    assert _config_de_modelos(origen).sparse_vector_source == origen
    assert _ajustes_de_ingesta(monkeypatch, origen).sparse_vector_source == origen


def test_las_dos_configuraciones_rechazan_el_mismo_origen_no_admitido(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    with pytest.raises(ConfigInvalida):
        _config_de_modelos("bm25")
    with pytest.raises(ValueError):
        _ajustes_de_ingesta(monkeypatch, "bm25")
