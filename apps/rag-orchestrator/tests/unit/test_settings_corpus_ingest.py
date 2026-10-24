"""Configuración de la ingesta en lote (US-117a D5, RN-22): comparte claves con la semilla y valida SPARSE_VECTOR_SOURCE."""

from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import ValidationError

from app.config.settings import CorpusIngestSettings

SHA = "ab" * 32
CLAVES = {
    "CORPUS_ACCEPTED_LICENSES": "dominio_publico,cc_by,cc_by_sa",
    "CORPUS_EXCLUDED_SOURCES": "NCCN,ESMO",
    "CORPUS_CUTOFF_DATE": "2026-10-16",
    "CORPUS_CHUNK_SIZE": "1024",
    "CORPUS_CHUNK_OVERLAP": "0",
    "SPARSE_VECTOR_SOURCE": "modelo_embeddings",
    "EMBEDDING_SPARSE_WEIGHTS_PATH": "/models/sparse_linear.npz",
    "EMBEDDING_SPARSE_WEIGHTS_SHA256": SHA,
}


def con_entorno(monkeypatch: pytest.MonkeyPatch, **cambios: str) -> CorpusIngestSettings:
    for clave in (*CLAVES, "CORPUS_SEED_MANIFEST_PATH"):
        monkeypatch.delenv(clave, raising=False)
    for clave, valor in {**CLAVES, **cambios}.items():
        monkeypatch.setenv(clave, valor)
    return CorpusIngestSettings(_env_file=None)  # type: ignore[call-arg]


def test_lee_las_mismas_claves_de_corpus_que_la_semilla_sin_exigir_el_manifiesto(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    ajustes = con_entorno(monkeypatch)

    assert ajustes.corpus_excluded_sources == ("NCCN", "ESMO")
    assert ajustes.corpus_chunk_size == 1024
    assert ajustes.sparse_vector_source == "modelo_embeddings"
    assert ajustes.embedding_sparse_weights_path == Path("/models/sparse_linear.npz")


def test_falla_nombrando_la_clave_cuando_el_origen_del_sparse_no_es_modelo_embeddings(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    with pytest.raises(ValidationError) as error:
        con_entorno(monkeypatch, SPARSE_VECTOR_SOURCE="bm25")

    assert "sparse_vector_source" in str(error.value)
    assert "bm25" not in str(error.value)


@pytest.mark.parametrize("clave", ["SPARSE_VECTOR_SOURCE", "EMBEDDING_SPARSE_WEIGHTS_SHA256"])
def test_falla_cuando_falta_una_clave_obligatoria_del_sparse(
    monkeypatch: pytest.MonkeyPatch, clave: str
) -> None:
    for k, valor in CLAVES.items():
        monkeypatch.setenv(k, valor)
    monkeypatch.delenv(clave)

    with pytest.raises(ValidationError):
        CorpusIngestSettings(_env_file=None)  # type: ignore[call-arg]


def test_falla_cuando_el_sha256_de_los_pesos_no_es_hexadecimal_de_64_caracteres(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    with pytest.raises(ValidationError):
        con_entorno(monkeypatch, EMBEDDING_SPARSE_WEIGHTS_SHA256="xyz")
