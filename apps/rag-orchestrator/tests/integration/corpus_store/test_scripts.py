"""Los scripts de operación del corpus contra PostgreSQL y Milvus reales (US-058 D6): los mismos que usa Compose."""

from __future__ import annotations

import json
from collections.abc import Callable

import pytest
from sqlalchemy import text
from sqlalchemy.engine import URL

from app.infrastructure.catalog.conexion import crear_motor
from app.scripts import init_corpus_store, migrate_corpus_catalog
from app.scripts.migrate_corpus_catalog import revision_head
from tests.support.milvus import INDICE_DE_ADR39
from tests.support.pg import BaseDeTest

pytestmark = pytest.mark.servicios_reales


def configurar_milvus(
    monkeypatch: pytest.MonkeyPatch, uri: str, coleccion: str, dimension: int
) -> None:
    monkeypatch.setenv("MILVUS_URI", uri)
    monkeypatch.setenv("MILVUS_COLLECTION_NAME", coleccion)
    monkeypatch.setenv("EMBEDDING_DIM", str(dimension))
    monkeypatch.setenv("VECTOR_INDEX_TYPE", "HNSW")
    monkeypatch.setenv("VECTOR_INDEX_PARAMS", json.dumps(INDICE_DE_ADR39))
    monkeypatch.setenv("MILVUS_DENSE_METRIC_TYPE", "COSINE")


@pytest.mark.ac("US-058", 5)
def test_init_corpus_store_crea_la_coleccion_y_al_repetirse_la_deja_intacta_sin_credenciales_en_la_salida(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
    uri_de_milvus: str,
    nueva_coleccion: Callable[[], str],
) -> None:
    coleccion = nueva_coleccion()
    configurar_milvus(monkeypatch, uri_de_milvus, coleccion, 8)

    primera = (init_corpus_store.main(), capsys.readouterr().out)
    segunda = (init_corpus_store.main(), capsys.readouterr().out)

    assert primera == (0, f"init_corpus_store: colección {coleccion} creada\n")
    assert segunda == (
        0,
        f"init_corpus_store: colección {coleccion} ya existía con el esquema esperado\n",
    )


@pytest.mark.ac("US-058", 5)
def test_init_corpus_store_con_otra_dimension_sale_con_1_nombrando_el_campo_y_las_dimensiones(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
    uri_de_milvus: str,
    nueva_coleccion: Callable[[], str],
) -> None:
    coleccion = nueva_coleccion()
    configurar_milvus(monkeypatch, uri_de_milvus, coleccion, 8)
    init_corpus_store.main()
    capsys.readouterr()
    configurar_milvus(monkeypatch, uri_de_milvus, coleccion, 16)

    codigo = init_corpus_store.main()

    error = capsys.readouterr().err
    assert codigo == 1
    assert "dense_vector" in error and "16" in error and "8" in error


def test_migrate_corpus_catalog_main_migra_como_rag_corpus_migrator_y_es_idempotente(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
    base_con_schema_vacio: BaseDeTest,
) -> None:
    url = base_con_schema_vacio.url_migrador
    # La URL del entorno no lleva contraseña: sale del archivo PG_RAG_CORPUS_MIGRATOR_PASSWORD_FILE.
    sin_contrasena = URL.create(
        url.drivername,
        username=url.username,
        host=url.host,
        port=url.port,
        database=url.database,
        query=url.query,
    )
    monkeypatch.setenv(
        "CORPUS_MIGRATOR_DATABASE_URL", sin_contrasena.render_as_string(hide_password=False)
    )

    primera = migrate_corpus_catalog.main()
    segunda = migrate_corpus_catalog.main()

    capturado = capsys.readouterr()
    salida = capturado.out
    motor = crear_motor(url)
    try:
        with motor.connect() as conexion:
            tablas = conexion.execute(
                text("SELECT count(*) FROM pg_tables WHERE schemaname = 'corpus'")
            ).scalar_one()
            version_en_la_base = conexion.execute(
                text("SELECT version_num FROM corpus.alembic_version")
            ).scalar_one()
    finally:
        motor.dispose()
    assert (primera, segunda, tablas) == (0, 0, 4), capturado.err
    assert version_en_la_base == revision_head()  # fuente independiente de la salida
    assert salida.count(revision_head()) == 2  # una por corrida; head real, no fijo
    contrasena_en_la_salida = url.password in salida
    assert not contrasena_en_la_salida, "la salida del one-shot contiene la contraseña del migrator"
