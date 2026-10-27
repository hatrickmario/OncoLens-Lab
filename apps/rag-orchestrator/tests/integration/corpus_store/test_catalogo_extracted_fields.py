"""Catálogo del corpus (US-118/US-117, M-08.4): columna ``extracted_fields`` de la migración ``0004``.

Test después (matriz TDD: migración): PostgreSQL real. Solo filas sintéticas.
"""

from __future__ import annotations

import json

import pytest
from alembic import command
from sqlalchemy import text

from app.scripts.migrate_corpus_catalog import configuracion_de_alembic, migrar
from tests.integration.corpus_store.test_catalogo import (
    fila_sintetica,
    insertar_documento,
    transaccion_revertida,
)
from tests.support.pg import BaseDeTest

pytestmark = pytest.mark.servicios_reales

REVISION_ANTERIOR = "0003_metadata_source_pendiente"


def test_corpus_catalog_extracted_fields_es_una_lista_vacia_por_defecto_y_guarda_los_campos_indicados(
    base_migrada: BaseDeTest,
) -> None:
    with transaccion_revertida(base_migrada) as conexion:
        insertar_documento(conexion, fila_sintetica())
        por_defecto = conexion.execute(
            text("SELECT extracted_fields FROM corpus.corpus_document")
        ).scalar_one()
    assert por_defecto == []

    with transaccion_revertida(base_migrada) as conexion:
        insertar_documento(conexion, fila_sintetica(extracted_fields=json.dumps(["trial_phase"])))
        guardado = conexion.execute(
            text("SELECT extracted_fields FROM corpus.corpus_document")
        ).scalar_one()
    assert guardado == ["trial_phase"]


def test_corpus_catalog_downgrade_elimina_la_columna_extracted_fields(
    base_migrada: BaseDeTest,
) -> None:
    try:
        command.downgrade(configuracion_de_alembic(base_migrada.url_migrador), REVISION_ANTERIOR)
        with transaccion_revertida(base_migrada) as conexion:
            columnas = (
                conexion.execute(
                    text(
                        "SELECT column_name FROM information_schema.columns "
                        "WHERE table_schema = 'corpus' AND table_name = 'corpus_document'"
                    )
                )
                .scalars()
                .all()
            )
        assert "extracted_fields" not in columnas
    finally:
        migrar(base_migrada.url_migrador)
