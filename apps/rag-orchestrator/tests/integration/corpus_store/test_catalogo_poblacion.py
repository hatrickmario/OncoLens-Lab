"""`LectorCatalogoPostgres.poblacion_por_documento` contra el PostgreSQL de test: `population_criteria` y `metadata_source`
del schema `corpus` con el rol `rag_corpus` (US-122 / L1D-127, tarea 1.10).

Test después (infraestructura). Se pide con ``-m servicios_reales`` dentro de ``corpus-db-net`` (ver ``tests/support/pg.py``).
Solo filas sintéticas.
"""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from sqlalchemy import Engine, text

from app.domain.aplicabilidad_tipos import PoblacionDelEstudio
from app.infrastructure.catalog.catalogo_reader import LectorCatalogoPostgres
from app.infrastructure.catalog.conexion import crear_motor
from app.infrastructure.catalog.corpus_document_repository import CorpusDocumentRepository
from tests.support.pg import BaseDeTest
from tests.support.registros import registro_de_prueba

pytestmark = pytest.mark.servicios_reales


@pytest.fixture
def motor(base_migrada: BaseDeTest) -> Iterator[Engine]:
    motor = crear_motor(base_migrada.url_runtime)
    yield motor
    with motor.begin() as conexion:
        conexion.execute(text("DELETE FROM corpus.corpus_document"))
    motor.dispose()


def test_poblacion_por_documento_devuelve_el_objeto_biomarcadores_y_el_origen_cuando_el_documento_es_estructurado(
    motor: Engine,
):
    criterios = {"biomarcadores": {"her2": "positivo"}, "ecog": "0-1", "linea": "no_disponible"}
    CorpusDocumentRepository(motor).guardar_documento(
        registro_de_prueba(
            "doc-a1@abcdef", population_criteria=criterios, metadata_source="extraido_verificado"
        )
    )

    poblaciones = LectorCatalogoPostgres(motor).poblacion_por_documento({"doc-a1@abcdef"})

    assert poblaciones == {"doc-a1@abcdef": PoblacionDelEstudio("extraido_verificado", criterios)}


def test_poblacion_por_documento_admite_pendiente_y_omite_los_documentos_inexistentes(
    motor: Engine,
):
    CorpusDocumentRepository(motor).guardar_documento(
        registro_de_prueba("doc-a6@abcdef", metadata_source="pendiente")
    )

    poblaciones = LectorCatalogoPostgres(motor).poblacion_por_documento(
        {"doc-a6@abcdef", "doc-inexistente"}
    )

    assert set(poblaciones) == {"doc-a6@abcdef"}
    assert poblaciones["doc-a6@abcdef"].metadata_source == "pendiente"


def test_poblacion_por_documento_devuelve_vacio_cuando_no_se_piden_documentos(motor: Engine):
    assert LectorCatalogoPostgres(motor).poblacion_por_documento(set()) == {}
