"""Catálogo del corpus (US-118 AC-6, D6): ``metadata_source = pendiente`` tras la migración ``0003``.

Test después (matriz TDD: migración): PostgreSQL real como ``rag_corpus_migrator`` y ``rag_corpus``. Solo filas sintéticas.
La comparación de todos los ``CHECK`` con ``DOMINIOS_CERRADOS`` ya la hace ``test_catalogo.py`` (parametrizada por columna).
"""

from __future__ import annotations

import pytest
from alembic import command
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.infrastructure.catalog.conexion import crear_motor
from app.scripts.migrate_corpus_catalog import configuracion_de_alembic, migrar
from tests.integration.corpus_store.test_catalogo import (
    fila_sintetica,
    insertar_documento,
    transaccion_revertida,
)
from tests.support.pg import BaseDeTest

pytestmark = pytest.mark.servicios_reales

REVISION_ANTERIOR = "0002_corpus_document_source_url"


@pytest.mark.ac("US-118", 6)
def test_corpus_catalog_acepta_metadata_source_pendiente_y_rechaza_un_valor_fuera_del_dominio(
    base_migrada: BaseDeTest,
) -> None:
    """[US-118 AC-6] Tras migrar, el catálogo acepta pendiente y rechaza un valor fuera del dominio."""
    with transaccion_revertida(base_migrada) as conexion:
        insertar_documento(conexion, fila_sintetica(metadata_source="pendiente"))
        guardado = conexion.execute(
            text("SELECT metadata_source FROM corpus.corpus_document")
        ).scalar_one()
    assert guardado == "pendiente"

    with transaccion_revertida(base_migrada) as conexion, pytest.raises(IntegrityError) as error:
        insertar_documento(conexion, fila_sintetica(metadata_source="inferido"))
    assert error.value.orig.diag.constraint_name == "ck_corpus_document_metadata_source"


def test_corpus_catalog_downgrade_falla_sin_reescribir_datos_si_quedan_filas_pendiente(
    base_migrada: BaseDeTest,
) -> None:
    motor = crear_motor(base_migrada.url_runtime)
    try:
        with motor.begin() as conexion:
            insertar_documento(conexion, fila_sintetica(metadata_source="pendiente"))
        with pytest.raises(Exception, match="metadata_source = 'pendiente'"):
            command.downgrade(
                configuracion_de_alembic(base_migrada.url_migrador), REVISION_ANTERIOR
            )
        with motor.connect() as conexion:
            restantes = (
                conexion.execute(text("SELECT metadata_source FROM corpus.corpus_document"))
                .scalars()
                .all()
            )
        assert restantes == ["pendiente"]
    finally:
        with motor.begin() as conexion:
            conexion.execute(text("DELETE FROM corpus.corpus_document"))
        motor.dispose()
        migrar(base_migrada.url_migrador)


def test_corpus_catalog_downgrade_restaura_el_check_anterior_cuando_no_hay_filas_pendiente(
    base_migrada: BaseDeTest,
) -> None:
    try:
        command.downgrade(configuracion_de_alembic(base_migrada.url_migrador), REVISION_ANTERIOR)
        with (
            transaccion_revertida(base_migrada) as conexion,
            pytest.raises(IntegrityError) as error,
        ):
            insertar_documento(conexion, fila_sintetica(metadata_source="pendiente"))
        assert error.value.orig.diag.constraint_name == "ck_corpus_document_metadata_source"
    finally:
        migrar(base_migrada.url_migrador)
