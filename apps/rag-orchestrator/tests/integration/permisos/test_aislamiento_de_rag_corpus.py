"""Aislamiento de ``rag_corpus`` en ejecución (US-040 AC-1 a AC-3, RN-10, SEG-06).

Test después (matriz TDD: migración), pero los de AC-2 y AC-3 fallan sin la migración de privilegios de clinical-api: la
base sembrada lleva la precondición hostil (``GRANT`` que daría acceso). Conexión REAL como cada rol, con TLS. Solo tablas
sintéticas vacías (RN-13); los mensajes no incluyen filas.
"""

from __future__ import annotations

import psycopg
import pytest
from psycopg import sql
from sqlalchemy.engine import URL

from tests.integration.conftest import nuevo_sufijo
from tests.support.pg import BaseDeTest, conectar
from tests.support.schemas_clinicos import (
    SCHEMAS_CLINICOS,
    TABLA_SINTETICA,
    crear_tabla_posterior_a_la_migracion,
)

pytestmark = pytest.mark.servicios_reales

RUNTIME = "rag_corpus"
MIGRADOR = "rag_corpus_migrator"


def _url_del_rol(base: BaseDeTest, rol: str) -> URL:
    url = {RUNTIME: base.url_runtime, MIGRADOR: base.url_migrador}[rol]
    assert url.username == rol
    return url


def _seleccionar(url: URL, esquema: str, tabla: str) -> None:
    with conectar(url) as cliente:
        cliente.execute(
            sql.SQL("SELECT * FROM {}.{}").format(sql.Identifier(esquema), sql.Identifier(tabla))
        )


@pytest.mark.ac("US-040", 1)
def test_rag_corpus_dentro_de_corpus_inserta_y_lee_lo_creado_por_el_migrator(
    base_con_schemas_clinicos: BaseDeTest,
) -> None:
    base = base_con_schemas_clinicos
    tabla = (
        f"tabla_de_prueba_{nuevo_sufijo()}"  # la base es de módulo: sin nombres fijos entre tests
    )
    with conectar(base.url_migrador) as migrador:
        migrador.execute(f"CREATE TABLE corpus.{tabla} (id integer)")
    with conectar(base.url_runtime) as runtime:
        runtime.execute(f"INSERT INTO corpus.{tabla} (id) VALUES (1)")
        assert runtime.execute(f"SELECT id FROM corpus.{tabla}").fetchall() == [(1,)]
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            runtime.execute(f"CREATE TABLE corpus.{tabla}_del_runtime (id integer)")


@pytest.mark.parametrize("rol", [RUNTIME, MIGRADOR])
@pytest.mark.parametrize("esquema", SCHEMAS_CLINICOS)
@pytest.mark.ac("US-040", 2)
def test_rol_del_corpus_select_en_schema_clinico_permission_denied(
    base_con_schemas_clinicos: BaseDeTest, esquema: str, rol: str
) -> None:
    url = _url_del_rol(base_con_schemas_clinicos, rol)
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        _seleccionar(url, esquema, TABLA_SINTETICA)


@pytest.mark.parametrize("esquema", SCHEMAS_CLINICOS)
@pytest.mark.ac("US-040", 3)
def test_rag_corpus_tabla_futura_en_schema_clinico_permission_denied(
    base_con_schemas_clinicos: BaseDeTest, esquema: str
) -> None:
    base = base_con_schemas_clinicos
    tabla = f"futura_{esquema}"
    crear_tabla_posterior_a_la_migracion(base.url_administracion, esquema, tabla)
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        _seleccionar(base.url_runtime, esquema, tabla)
