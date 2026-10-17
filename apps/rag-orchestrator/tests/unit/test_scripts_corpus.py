"""Scripts de operación del corpus (US-058 D6): código de salida y salida sin credenciales, sin servicios."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.scripts import init_corpus_store, migrate_corpus_catalog

CLAVES = (
    "CORPUS_MIGRATOR_DATABASE_URL",
    "PG_RAG_CORPUS_MIGRATOR_PASSWORD_FILE",
    "MILVUS_URI",
    "EMBEDDING_DIM",
    "VECTOR_INDEX_TYPE",
    "VECTOR_INDEX_PARAMS",
    "MILVUS_DENSE_METRIC_TYPE",
)


@pytest.fixture(autouse=True)
def entorno_limpio(monkeypatch: pytest.MonkeyPatch) -> None:
    for clave in CLAVES:
        monkeypatch.delenv(clave, raising=False)


def test_migrate_corpus_catalog_con_contrasena_en_la_url_sale_con_1_y_no_la_imprime(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str], tmp_path: Path
) -> None:
    archivo = tmp_path / "pg_rag_corpus_migrator_password"
    archivo.write_text("contrasena-ficticia\n")
    monkeypatch.setenv(
        "CORPUS_MIGRATOR_DATABASE_URL",
        "postgresql+psycopg://rag_corpus_migrator:SECRETO-XYZ@postgres/x?sslmode=require",
    )
    monkeypatch.setenv("PG_RAG_CORPUS_MIGRATOR_PASSWORD_FILE", str(archivo))

    codigo = migrate_corpus_catalog.main()

    salida = capsys.readouterr()
    assert codigo == 1
    assert "CORPUS_MIGRATOR_DATABASE_URL" in salida.err
    assert (
        "SECRETO-XYZ" not in salida.out + salida.err
        and "contrasena-ficticia" not in salida.out + salida.err
    )


def test_migrate_corpus_catalog_con_archivo_de_secreto_ilegible_sale_con_1_nombrando_la_variable(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str], tmp_path: Path
) -> None:
    monkeypatch.setenv(
        "CORPUS_MIGRATOR_DATABASE_URL",
        "postgresql+psycopg://rag_corpus_migrator@postgres/x?sslmode=require",
    )
    monkeypatch.setenv("PG_RAG_CORPUS_MIGRATOR_PASSWORD_FILE", str(tmp_path / "no-existe"))

    codigo = migrate_corpus_catalog.main()

    assert (codigo, "PG_RAG_CORPUS_MIGRATOR_PASSWORD_FILE" in capsys.readouterr().err) == (1, True)


def test_init_corpus_store_sin_configuracion_sale_con_1_nombrando_las_claves_que_faltan(
    capsys: pytest.CaptureFixture[str],
) -> None:
    codigo = init_corpus_store.main()

    mensaje = capsys.readouterr().err
    assert codigo == 1
    assert "EMBEDDING_DIM" in mensaje and "MILVUS_URI" in mensaje and "VECTOR_INDEX_TYPE" in mensaje
