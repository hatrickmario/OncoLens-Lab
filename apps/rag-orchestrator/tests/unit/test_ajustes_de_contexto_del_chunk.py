"""Configuración de la variante de contexto del chunk (US-279 AC-3, L1D-337, RN-22): valor por defecto, conjunto cerrado, límites."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.config.settings import (
    AjustesDeReindexacionDeContexto,
    CorpusIngestSettings,
    CorpusSeedSettings,
)
from app.domain.corpus_seed.contexto_del_chunk import (
    CONTEXTO_LLM_CONCURRENCIA_INICIAL,
    CONTEXTO_LLM_DOC_MAX_CHARS_INICIAL,
    CONTEXTO_LLM_MAX_CHARS_INICIAL,
    CONTEXTO_MAX_CHARS_INICIAL,
    CONTEXTO_REINDEXACION_LOTE_INICIAL,
    VARIANTE_INICIAL,
    VarianteDeContexto,
)

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
    "CORPUS_SEED_MANIFEST_PATH": "/manifiesto.yaml",
}
CLAVES_DE_CONTEXTO = (
    "CORPUS_CHUNK_CONTEXT",
    "CORPUS_CHUNK_CONTEXT_MAX_CHARS",
    "CORPUS_CHUNK_CONTEXT_LLM_MAX_CHARS",
    "CORPUS_CHUNK_CONTEXT_LLM_DOC_MAX_CHARS",
    "CORPUS_CHUNK_CONTEXT_LLM_CONCURRENCY",
    "CORPUS_CONTEXT_REINDEX_BATCH_SIZE",
)


def _entorno(monkeypatch: pytest.MonkeyPatch, **cambios: str) -> None:
    for clave in CLAVES_DE_CONTEXTO:
        monkeypatch.delenv(clave, raising=False)
    for clave, valor in {**CLAVES, **cambios}.items():
        monkeypatch.setenv(clave, valor)


def _ingesta(monkeypatch: pytest.MonkeyPatch, **cambios: str) -> CorpusIngestSettings:
    _entorno(monkeypatch, **cambios)
    return CorpusIngestSettings(_env_file=None)  # type: ignore[call-arg]


def test_la_variante_por_defecto_es_ninguno_con_los_valores_iniciales_de_dominio(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    ajustes = _ingesta(monkeypatch)

    assert ajustes.corpus_chunk_context is VARIANTE_INICIAL is VarianteDeContexto.NINGUNO
    assert ajustes.corpus_chunk_context_max_chars == CONTEXTO_MAX_CHARS_INICIAL
    assert ajustes.corpus_chunk_context_llm_max_chars == CONTEXTO_LLM_MAX_CHARS_INICIAL
    assert ajustes.corpus_chunk_context_llm_doc_max_chars == CONTEXTO_LLM_DOC_MAX_CHARS_INICIAL
    assert ajustes.corpus_chunk_context_llm_concurrency == CONTEXTO_LLM_CONCURRENCIA_INICIAL


def test_la_semilla_lee_la_misma_variante_y_el_mismo_limite_que_la_ingesta(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _entorno(monkeypatch, CORPUS_CHUNK_CONTEXT="determinista", CORPUS_CHUNK_CONTEXT_MAX_CHARS="120")

    semilla = CorpusSeedSettings(_env_file=None)  # type: ignore[call-arg]

    assert semilla.corpus_chunk_context is VarianteDeContexto.DETERMINISTA
    assert semilla.corpus_chunk_context_max_chars == 120


@pytest.mark.parametrize("valor", ["determinista", "llm"])
def test_lee_la_variante_de_la_variable_de_entorno(
    monkeypatch: pytest.MonkeyPatch, valor: str
) -> None:
    assert _ingesta(monkeypatch, CORPUS_CHUNK_CONTEXT=valor).corpus_chunk_context == valor


def test_un_valor_fuera_del_conjunto_falla_nombrando_la_variable_sin_eco_del_valor(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    with pytest.raises(ValidationError) as error:
        _ingesta(monkeypatch, CORPUS_CHUNK_CONTEXT="resumen")

    assert [e["loc"][0] for e in error.value.errors()] == ["corpus_chunk_context"]
    assert "resumen" not in str(error.value)


@pytest.mark.parametrize(
    "variable",
    [
        "CORPUS_CHUNK_CONTEXT_MAX_CHARS",
        "CORPUS_CHUNK_CONTEXT_LLM_MAX_CHARS",
        "CORPUS_CHUNK_CONTEXT_LLM_DOC_MAX_CHARS",
        "CORPUS_CHUNK_CONTEXT_LLM_CONCURRENCY",
    ],
)
def test_un_limite_no_positivo_falla_nombrando_la_variable(
    monkeypatch: pytest.MonkeyPatch, variable: str
) -> None:
    with pytest.raises(ValidationError) as error:
        _ingesta(monkeypatch, **{variable: "0"})

    assert [e["loc"][0] for e in error.value.errors()] == [variable.lower()]


def test_la_reindexacion_lee_la_variante_los_limites_y_el_lote_sin_exigir_licencias(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _entorno(monkeypatch, CORPUS_CHUNK_CONTEXT="llm", CORPUS_CONTEXT_REINDEX_BATCH_SIZE="32")
    for clave in ("CORPUS_ACCEPTED_LICENSES", "CORPUS_EXCLUDED_SOURCES", "CORPUS_CUTOFF_DATE"):
        monkeypatch.delenv(clave)

    ajustes = AjustesDeReindexacionDeContexto(_env_file=None)  # type: ignore[call-arg]

    assert ajustes.corpus_chunk_context is VarianteDeContexto.LLM
    assert ajustes.corpus_context_reindex_batch_size == 32


def test_el_lote_de_la_reindexacion_tiene_el_valor_inicial_de_dominio(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _entorno(monkeypatch)

    ajustes = AjustesDeReindexacionDeContexto(_env_file=None)  # type: ignore[call-arg]

    assert ajustes.corpus_context_reindex_batch_size == CONTEXTO_REINDEXACION_LOTE_INICIAL
