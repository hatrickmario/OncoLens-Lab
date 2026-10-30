"""La migración 0005 no abre la frontera de ``rag_corpus`` (US-241 AC-6, AC-T4.4, SEG-06).

Test después (migración): sobre la base migrada a ``head`` (0005) con los cinco schemas clínicos sintéticos. Solo tablas
sintéticas vacías (RN-13).
"""

from __future__ import annotations

import psycopg
import pytest

from app.config.settings import ROL_MIGRADOR_CORPUS
from app.scripts.migrate_corpus_catalog import revision_head
from tests.support.pg import BaseDeTest, conectar
from tests.support.schemas_clinicos import SCHEMAS_VEDADOS, TABLA_SINTETICA

pytestmark = pytest.mark.servicios_reales


@pytest.mark.ac("US-241", 6)
def test_migracion_0005_no_crea_objetos_fuera_de_corpus_y_rag_corpus_sigue_sin_leer_los_schemas_clinicos(
    base_con_schemas_clinicos: BaseDeTest,
) -> None:
    base = base_con_schemas_clinicos
    with conectar(base.url_migrador) as migrador:
        version = migrador.execute("SELECT version_num FROM corpus.alembic_version").fetchone()
        fuera_de_corpus = migrador.execute(
            "SELECT n.nspname, c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace "
            "WHERE c.relowner = (SELECT oid FROM pg_roles WHERE rolname = %s) AND n.nspname <> 'corpus' AND n.nspname !~ '^pg_toast'",
            (ROL_MIGRADOR_CORPUS,),
        ).fetchall()
    assert version == (revision_head(),)
    assert fuera_de_corpus == []
    for esquema in SCHEMAS_VEDADOS:
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            with conectar(base.url_runtime) as runtime:
                runtime.execute(f'SELECT * FROM "{esquema}"."{TABLA_SINTETICA}"')
