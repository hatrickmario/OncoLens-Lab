"""``python -m app.scripts.load_seed_corpus`` sin servicios: configuración, adapter real ausente y manifiesto inválido."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.config.settings import CorpusSeedSettings
from app.scripts import load_seed_corpus
from tests.support.semilla import EmbedderFalso, MANIFIESTO_FX_06C_A

ENTORNO_VALIDO = {
    "CORPUS_SEED_MANIFEST_PATH": str(MANIFIESTO_FX_06C_A),
    "CORPUS_ACCEPTED_LICENSES": "dominio_publico,cc_by,cc_by_sa",
    "CORPUS_EXCLUDED_SOURCES": "NCCN,ESMO",
    "CORPUS_CUTOFF_DATE": "2026-10-15",
    "CORPUS_CHUNK_SIZE": "12",
    "CORPUS_CHUNK_OVERLAP": "0",
    "MILVUS_URI": "http://milvus.invalid:19530",
    "EMBEDDING_DIM": "8",
    "VECTOR_INDEX_TYPE": "HNSW",
    "VECTOR_INDEX_PARAMS": '{"M": 16, "efConstruction": 200, "ef": 64}',
    "MILVUS_DENSE_METRIC_TYPE": "COSINE",
    "CORPUS_DATABASE_URL": "postgresql+psycopg://rag_corpus@postgres.invalid:5432/oncolens?sslmode=require",
    "PG_RAG_CORPUS_PASSWORD_FILE": "/run/secrets/no-existe",
}


@pytest.fixture
def entorno(monkeypatch: pytest.MonkeyPatch) -> pytest.MonkeyPatch:
    for clave, valor in ENTORNO_VALIDO.items():
        monkeypatch.setenv(clave, valor)
    monkeypatch.delenv("ALLOW_CC_BY_NC", raising=False)
    return monkeypatch


@pytest.mark.parametrize(
    "clave", ["CORPUS_CUTOFF_DATE", "CORPUS_ACCEPTED_LICENSES", "EMBEDDING_DIM"]
)
def test_una_clave_obligatoria_ausente_sale_con_1_nombrandola_sin_conectar(
    entorno: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str], clave: str
) -> None:
    entorno.delenv(clave)

    codigo = load_seed_corpus.main(embedder=EmbedderFalso())

    capturado = capsys.readouterr()
    assert codigo == 1 and clave in capturado.err and capturado.out == ""


@pytest.mark.parametrize(("valor", "esperado"), [(None, False), ("true", True), ("false", False)])
def test_la_politica_toma_allow_cc_by_nc_aunque_el_entorno_traiga_claves_parciales_de_adr39(
    entorno: pytest.MonkeyPatch, valor: str | None, esperado: bool
) -> None:
    if valor is not None:
        entorno.setenv("ALLOW_CC_BY_NC", valor)
    ajustes = CorpusSeedSettings(_env_file=None)  # type: ignore[call-arg]

    politica = load_seed_corpus.politica_de_licencias(ajustes)

    assert politica.permitir_cc_by_nc is esperado
    assert politica.aceptadas == {"dominio_publico", "cc_by", "cc_by_sa"}
    assert politica.excluidas == ("NCCN", "ESMO")


def test_un_valor_invalido_sale_con_1_nombrando_la_clave_y_sin_mostrar_el_valor(
    entorno: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    entorno.setenv("CORPUS_ACCEPTED_LICENSES", "cc_by_nd")

    codigo = load_seed_corpus.main(embedder=EmbedderFalso())

    error = capsys.readouterr().err
    assert codigo == 1 and "CORPUS_ACCEPTED_LICENSES" in error and "cc_by_nd" not in error


def test_sin_el_adapter_real_de_embeddings_falla_con_un_mensaje_claro_y_codigo_distinto_de_0(
    entorno: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    codigo = load_seed_corpus.main()

    capturado = capsys.readouterr()
    assert codigo == 1 and "L1D-106" in capturado.err and capturado.out == ""


def test_un_manifiesto_ilegible_sale_con_1_antes_de_conectarse_a_las_bases(
    entorno: pytest.MonkeyPatch, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    entorno.setenv("CORPUS_SEED_MANIFEST_PATH", str(tmp_path / "no-existe.yaml"))

    codigo = load_seed_corpus.main(embedder=EmbedderFalso())

    capturado = capsys.readouterr()
    assert codigo == 1 and "manifiesto" in capturado.err and str(tmp_path) not in capturado.err


def test_una_dependencia_obligatoria_que_falla_sale_con_1_nombrando_solo_la_clase_del_error(
    entorno: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    codigo = load_seed_corpus.main(embedder=EmbedderFalso())

    error = capsys.readouterr().err
    assert codigo == 1 and error.startswith("load_seed_corpus: falló (")
    assert "postgres.invalid" not in error and "no-existe" not in error  # ni hosts ni rutas
