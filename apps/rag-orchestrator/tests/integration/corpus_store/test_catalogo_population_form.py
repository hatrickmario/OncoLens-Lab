"""Catálogo del corpus (US-241 AC-3, ADR-47): columna ``population_form`` de la migración ``0005``.

Test después (matriz TDD: migración): PostgreSQL real, aplicada como ``rag_corpus_migrator``. Solo filas sintéticas.
"""

from __future__ import annotations

import json
from typing import Any

import pytest
from alembic import command
from alembic.script import ScriptDirectory
from sqlalchemy import Engine, text
from sqlalchemy.engine import URL

from app.infrastructure.catalog.conexion import crear_motor
from app.scripts.migrate_corpus_catalog import configuracion_de_alembic, migrar
from tests.integration.corpus_store.test_catalogo import (
    columnas_de,
    fila_sintetica,
    insertar_documento,
)
from tests.support.aplicabilidad import CRITERIOS_DE_DOC_A1
from tests.support.pg import BaseDeTest

pytestmark = pytest.mark.servicios_reales

REVISION_ANTERIOR = "0004_extracted_fields"


def _filas_de(motor: Engine) -> list[dict[str, Any]]:
    """Todas las filas de ``corpus_document`` sin la columna de 0005, ordenadas por ``document_id``."""
    with motor.connect() as conexion:
        filas = conexion.execute(
            text("SELECT * FROM corpus.corpus_document ORDER BY document_id")
        ).mappings()
        return [{k: v for k, v in fila.items() if k != "population_form"} for fila in filas]


@pytest.mark.ac("US-241", 3)
def test_migracion_0005_conserva_las_filas_y_downgrade_deja_el_schema_como_0004(
    base_con_schema_vacio: BaseDeTest,
) -> None:
    configuracion = configuracion_de_alembic(base_con_schema_vacio.url_migrador)
    command.upgrade(configuracion, REVISION_ANTERIOR)
    esquema_0004 = columnas_de(base_con_schema_vacio)
    motor = crear_motor(base_con_schema_vacio.url_migrador)
    try:
        with motor.begin() as conexion:
            insertar_documento(
                conexion,
                fila_sintetica(
                    document_id="doc-a1", population_criteria=json.dumps(CRITERIOS_DE_DOC_A1)
                ),
            )
        filas_0004 = _filas_de(motor)

        migrar(base_con_schema_vacio.url_migrador)

        assert _filas_de(motor) == filas_0004
        assert columnas_de(base_con_schema_vacio)["corpus_document"]["population_form"] == (
            "text",
            False,
        )
        with motor.connect() as conexion:
            forma = conexion.execute(
                text("SELECT population_form FROM corpus.corpus_document")
            ).scalar_one()
        assert forma == "antigua"

        command.downgrade(configuracion, "-1")

        assert columnas_de(base_con_schema_vacio) == esquema_0004
        assert _filas_de(motor) == filas_0004
    finally:
        motor.dispose()


def test_migracion_0005_deja_una_sola_cabeza_de_alembic() -> None:
    cabezas = ScriptDirectory.from_config(
        configuracion_de_alembic(URL.create("postgresql"))
    ).get_heads()

    assert len(cabezas) == 1


def test_migracion_0005_rechaza_una_forma_fuera_de_antigua_y_lista(
    base_migrada: BaseDeTest,
) -> None:
    motor = crear_motor(base_migrada.url_migrador)
    try:
        with pytest.raises(Exception, match="ck_corpus_document_population_form"):
            with motor.begin() as conexion:
                insertar_documento(conexion, {**fila_sintetica(), "population_form": "otra"})
    finally:
        motor.dispose()
