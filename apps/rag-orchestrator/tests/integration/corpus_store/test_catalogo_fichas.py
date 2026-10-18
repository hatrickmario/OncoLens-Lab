"""`LectorCatalogoPostgres` contra el PostgreSQL de test: fichas de fuente del schema `corpus` con el rol `rag_corpus`.

Test después (infraestructura). Se pide con ``-m servicios_reales`` dentro de ``corpus-db-net`` (ver ``tests/support/pg.py``).
Solo filas sintéticas.
"""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from sqlalchemy import Engine, text

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


def test_fichas_por_documento_devuelve_solo_los_documentos_que_existen(motor: Engine) -> None:
    CorpusDocumentRepository(motor).guardar_documento(
        registro_de_prueba("doc-a@abcdef", title="Breast Cancer Treatment (test)")
    )

    fichas = LectorCatalogoPostgres(motor).fichas_por_documento({"doc-a@abcdef", "doc-inexistente"})

    assert set(fichas) == {"doc-a@abcdef"}
    assert fichas["doc-a@abcdef"].title == "Breast Cancer Treatment (test)"
    assert fichas["doc-a@abcdef"].authors is None


def test_fichas_por_documento_devuelve_vacio_cuando_no_se_piden_documentos(motor: Engine) -> None:
    assert LectorCatalogoPostgres(motor).fichas_por_documento(set()) == {}
