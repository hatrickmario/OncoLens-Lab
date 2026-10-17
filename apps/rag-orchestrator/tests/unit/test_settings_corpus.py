"""Configuración del corpus (US-058, RN-22): claves obligatorias, sin contraseñas en URLs y errores sin valores."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.config import modelos
from app.config.settings import CorpusDatabaseSettings, CorpusMigratorSettings, MilvusSettings

CLAVES_DE_MILVUS = {
    "MILVUS_URI": "http://milvus.test:19530",
    "EMBEDDING_DIM": "8",
    "VECTOR_INDEX_TYPE": "HNSW",
    "VECTOR_INDEX_PARAMS": '{"M": 16, "efConstruction": 200, "ef": 64}',
    "MILVUS_DENSE_METRIC_TYPE": "COSINE",
}
URL_RUNTIME = "postgresql+psycopg://rag_corpus@postgres:5432/oncolens?sslmode=require"
URL_MIGRADOR = "postgresql+psycopg://rag_corpus_migrator@postgres:5432/oncolens?sslmode=require"
CLAVES_DE_CORPUS = (
    "CORPUS_DATABASE_URL",
    "PG_RAG_CORPUS_PASSWORD_FILE",
    "CORPUS_MIGRATOR_DATABASE_URL",
    "PG_RAG_CORPUS_MIGRATOR_PASSWORD_FILE",
    *CLAVES_DE_MILVUS,
)


@pytest.fixture(autouse=True)
def entorno_limpio(monkeypatch: pytest.MonkeyPatch) -> None:
    for clave in CLAVES_DE_CORPUS:
        monkeypatch.delenv(clave, raising=False)


def test_milvus_settings_lee_dimension_e_indice_del_entorno_sin_valores_en_el_codigo(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    for clave, valor in CLAVES_DE_MILVUS.items():
        monkeypatch.setenv(clave, valor)

    ajustes = MilvusSettings(_env_file=None)

    assert (ajustes.embedding_dim, ajustes.vector_index_type, ajustes.milvus_collection_name) == (
        8,
        "HNSW",
        "corpus_chunks",
    )
    assert ajustes.vector_index_params == {"M": 16, "efConstruction": 200, "ef": 64}


@pytest.mark.parametrize(
    "clave", ["EMBEDDING_DIM", "VECTOR_INDEX_TYPE", "VECTOR_INDEX_PARAMS", "MILVUS_URI"]
)
def test_milvus_settings_sin_una_clave_falla_nombrandola(
    monkeypatch: pytest.MonkeyPatch, clave: str
) -> None:
    for nombre, valor in CLAVES_DE_MILVUS.items():
        if nombre != clave:
            monkeypatch.setenv(nombre, valor)

    with pytest.raises(ValidationError) as error:
        MilvusSettings(_env_file=None)

    assert clave.lower() in str(error.value)


def test_milvus_settings_con_dimension_invalida_falla_sin_mostrar_el_valor(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    for clave, valor in CLAVES_DE_MILVUS.items():
        monkeypatch.setenv(clave, valor)
    monkeypatch.setenv("EMBEDDING_DIM", "-7777")

    with pytest.raises(ValidationError) as error:
        MilvusSettings(_env_file=None)

    assert "embedding_dim" in str(error.value) and "7777" not in str(error.value)


def test_corpus_database_settings_acepta_la_url_del_runtime_sin_contrasena(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("CORPUS_DATABASE_URL", URL_RUNTIME)
    monkeypatch.setenv("PG_RAG_CORPUS_PASSWORD_FILE", "/run/secrets/pg_rag_corpus_password")

    ajustes = CorpusDatabaseSettings(_env_file=None)

    assert ajustes.corpus_database_url == URL_RUNTIME


@pytest.mark.parametrize(
    ("url", "motivo"),
    [
        (
            "postgresql+psycopg://rag_corpus:CLAVE-SECRETA-77@postgres:5432/oncolens?sslmode=require",
            "contraseña",
        ),
        ("postgresql+psycopg://rag_corpus@postgres:5432/oncolens", "sslmode=require"),
        (URL_MIGRADOR, "rag_corpus"),
        ("mysql://rag_corpus@postgres/oncolens?sslmode=require", "PostgreSQL"),
    ],
)
def test_corpus_database_settings_rechaza_url_invalida_nombrando_la_clave_y_sin_filtrar_la_contrasena(
    monkeypatch: pytest.MonkeyPatch, url: str, motivo: str
) -> None:
    monkeypatch.setenv("CORPUS_DATABASE_URL", url)
    monkeypatch.setenv("PG_RAG_CORPUS_PASSWORD_FILE", "/run/secrets/pg_rag_corpus_password")

    with pytest.raises(ValidationError) as error:
        CorpusDatabaseSettings(_env_file=None)

    mensaje = str(error.value)
    assert "CORPUS_DATABASE_URL" in mensaje and motivo in mensaje
    assert "CLAVE-SECRETA-77" not in mensaje


def test_corpus_migrator_settings_exige_el_rol_del_migrator_y_rechaza_el_del_runtime(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("CORPUS_MIGRATOR_DATABASE_URL", URL_RUNTIME)
    monkeypatch.setenv(
        "PG_RAG_CORPUS_MIGRATOR_PASSWORD_FILE", "/run/secrets/pg_rag_corpus_migrator_password"
    )

    with pytest.raises(ValidationError) as error:
        CorpusMigratorSettings(_env_file=None)

    assert "CORPUS_MIGRATOR_DATABASE_URL" in str(error.value) and "rag_corpus_migrator" in str(
        error.value
    )


def test_corpus_migrator_settings_no_exige_la_contrasena_del_runtime(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("CORPUS_MIGRATOR_DATABASE_URL", URL_MIGRADOR)
    monkeypatch.setenv(
        "PG_RAG_CORPUS_MIGRATOR_PASSWORD_FILE", "/run/secrets/pg_rag_corpus_migrator_password"
    )

    ajustes = CorpusMigratorSettings(_env_file=None)

    assert ajustes.corpus_migrator_database_url == URL_MIGRADOR


def test_milvus_settings_admite_un_tipo_de_indice_que_adr39_amplia_en_tipos_indice(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Una sola fuente: los tipos admitidos son app.config.modelos.TIPOS_INDICE, no una lista propia de MilvusSettings.
    for clave, valor in CLAVES_DE_MILVUS.items():
        monkeypatch.setenv(clave, valor)
    monkeypatch.setenv("VECTOR_INDEX_TYPE", "IVF_FLAT")
    with pytest.raises(ValidationError) as antes:
        MilvusSettings(_env_file=None)

    monkeypatch.setattr(modelos, "TIPOS_INDICE", (*modelos.TIPOS_INDICE, "IVF_FLAT"))

    assert "vector_index_type" in str(antes.value)
    assert MilvusSettings(_env_file=None).vector_index_type == "IVF_FLAT"


def test_milvus_settings_valida_la_dimension_con_la_regla_de_adr39(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    for clave, valor in CLAVES_DE_MILVUS.items():
        monkeypatch.setenv(clave, valor)
    monkeypatch.setenv("EMBEDDING_DIM", "0")

    with pytest.raises(ValidationError) as error:
        MilvusSettings(_env_file=None)

    assert "entero positivo" in str(error.value)


@pytest.mark.ac("US-058", 2)
def test_settings_metrica_densa_fuera_de_cosine_o_ip_falla_nombrando_la_clave(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    for clave, valor in CLAVES_DE_MILVUS.items():
        monkeypatch.setenv(clave, valor)
    monkeypatch.setenv("MILVUS_DENSE_METRIC_TYPE", "L2")

    with pytest.raises(ValidationError) as error:
        MilvusSettings(_env_file=None)

    mensaje = str(error.value)
    assert "milvus_dense_metric_type" in mensaje
    assert "COSINE" in mensaje and "IP" in mensaje
    assert "L2" not in mensaje


@pytest.mark.parametrize("metrica", ["COSINE", "IP"])
def test_settings_metrica_densa_acepta_cosine_e_ip(
    monkeypatch: pytest.MonkeyPatch, metrica: str
) -> None:
    for clave, valor in CLAVES_DE_MILVUS.items():
        monkeypatch.setenv(clave, valor)
    monkeypatch.setenv("MILVUS_DENSE_METRIC_TYPE", metrica)

    assert MilvusSettings(_env_file=None).milvus_dense_metric_type == metrica
