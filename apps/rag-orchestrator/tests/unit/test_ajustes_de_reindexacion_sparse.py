"""Configuración de ``ingest reindex-sparse`` (US-117b D4/D5, RN-22): base ``AjustesSparse`` y tamaño de lote propio."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.config.settings import AjustesDeReindexacionSparse, AjustesSparse, CorpusIngestSettings

SHA = "a" * 64


def _entorno(monkeypatch: pytest.MonkeyPatch, **extra: str) -> None:
    monkeypatch.setenv("SPARSE_VECTOR_SOURCE", "modelo_embeddings")
    monkeypatch.setenv("EMBEDDING_SPARSE_WEIGHTS_PATH", "/models/embeddings/sparse_linear.npz")
    monkeypatch.setenv("EMBEDDING_SPARSE_WEIGHTS_SHA256", SHA)
    for clave, valor in extra.items():
        monkeypatch.setenv(clave, valor)


def test_no_exige_licencias_corte_ni_chunking_y_usa_un_lote_por_defecto_positivo(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _entorno(monkeypatch)

    ajustes = AjustesDeReindexacionSparse(_env_file=None)  # type: ignore[call-arg]

    assert ajustes.corpus_sparse_reindex_batch_size > 0
    assert ajustes.sparse_vector_source == "modelo_embeddings"


def test_lee_el_tamano_de_lote_de_la_variable_de_entorno(monkeypatch: pytest.MonkeyPatch) -> None:
    _entorno(monkeypatch, CORPUS_SPARSE_REINDEX_BATCH_SIZE="128")

    ajustes = AjustesDeReindexacionSparse(_env_file=None)  # type: ignore[call-arg]

    assert ajustes.corpus_sparse_reindex_batch_size == 128


@pytest.mark.parametrize("lote", ["0", "-1"])
def test_rechaza_un_lote_no_positivo(monkeypatch: pytest.MonkeyPatch, lote: str) -> None:
    _entorno(monkeypatch, CORPUS_SPARSE_REINDEX_BATCH_SIZE=lote)

    with pytest.raises(ValidationError):
        AjustesDeReindexacionSparse(_env_file=None)  # type: ignore[call-arg]


@pytest.mark.parametrize(
    ("variable", "valor"),
    [
        ("SPARSE_VECTOR_SOURCE", "otro"),
        ("EMBEDDING_SPARSE_WEIGHTS_SHA256", "no-es-sha"),
    ],
)
def test_rechaza_un_origen_o_un_sha256_invalidos_sin_eco_del_valor(
    monkeypatch: pytest.MonkeyPatch, variable: str, valor: str
) -> None:
    _entorno(monkeypatch, **{variable: valor})

    with pytest.raises(ValidationError) as error:
        AjustesSparse(_env_file=None)  # type: ignore[call-arg]

    assert valor not in str(error.value)


def test_la_ingesta_hereda_la_misma_base_de_sparse() -> None:
    assert issubclass(CorpusIngestSettings, AjustesSparse)
