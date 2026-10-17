"""`CatalogoCorpusPostgres` contra el PostgreSQL de test: la release vigente sale del schema `corpus` con el rol `rag_corpus`.

Test después (infraestructura). Se pide con ``-m servicios_reales`` dentro de ``corpus-db-net`` (ver ``tests/support/pg.py``).
Solo datos sintéticos (FX-06a-a: ``rel-test-1``, corte 2026-09-30, fuentes excluidas NCCN y ESMO).
"""

from __future__ import annotations

from collections.abc import Iterator
from datetime import UTC, date, datetime

import pytest
from sqlalchemy import Engine, text

from app.application.ports import ReleaseDelCorpus
from app.infrastructure.catalog.conexion import crear_motor
from app.infrastructure.catalog.release_reader import CatalogoCorpusPostgres, CorpusSinReleaseError
from tests.support.pg import BaseDeTest

pytestmark = pytest.mark.servicios_reales

INSERTAR_RELEASE = text(
    "INSERT INTO corpus.corpus_release (release_id, cutoff_date, document_count, excluded_sources, published_at) "
    "VALUES (:release_id, :cutoff_date, :document_count, :excluded_sources, :published_at)"
)


@pytest.fixture
def motor(base_migrada: BaseDeTest) -> Iterator[Engine]:
    """Motor del runtime ``rag_corpus`` (el mismo rol de producción); deja la tabla vacía al terminar."""
    motor = crear_motor(base_migrada.url_runtime)
    try:
        yield motor
    finally:
        with motor.begin() as conexion:
            conexion.execute(text("DELETE FROM corpus.corpus_release"))
        motor.dispose()


def _publicar(motor: Engine, release_id: str, publicada: datetime, excluidas: str) -> None:
    with motor.begin() as conexion:
        conexion.execute(
            INSERTAR_RELEASE,
            {
                "release_id": release_id,
                "cutoff_date": date(2026, 9, 30),
                "document_count": 4,
                "excluded_sources": excluidas,
                "published_at": publicada,
            },
        )


def test_release_vigente_devuelve_la_release_publicada_con_sus_fuentes_excluidas(
    motor: Engine,
) -> None:
    _publicar(motor, "rel-test-1", datetime(2026, 10, 1, tzinfo=UTC), "NCCN, ESMO")

    release = CatalogoCorpusPostgres(motor).release_vigente()

    assert release == ReleaseDelCorpus("rel-test-1", date(2026, 9, 30), ("NCCN", "ESMO"))


def test_release_vigente_devuelve_la_mas_reciente_cuando_hay_varias(motor: Engine) -> None:
    _publicar(motor, "rel-test-0", datetime(2026, 9, 1, tzinfo=UTC), "NCCN")
    _publicar(motor, "rel-test-1", datetime(2026, 10, 1, tzinfo=UTC), "NCCN, ESMO")

    assert CatalogoCorpusPostgres(motor).release_vigente().release_id == "rel-test-1"


def test_release_vigente_falla_cuando_el_catalogo_no_tiene_ninguna_release(motor: Engine) -> None:
    with pytest.raises(CorpusSinReleaseError):
        CatalogoCorpusPostgres(motor).release_vigente()
