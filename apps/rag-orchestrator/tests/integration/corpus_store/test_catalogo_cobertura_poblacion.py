"""`LectorDeCoberturaPostgres` contra el PostgreSQL de test: cobertura de `population_criteria` de los documentos vigentes
con el rol `rag_corpus` (US-132 AC-3, M-08.3, L1D-244).

Test de aceptación del AC-3 sobre el adapter real. Se pide con ``-m servicios_reales`` dentro de ``corpus-db-net`` (ver
``tests/support/pg.py``). Solo filas sintéticas.
"""

from __future__ import annotations

from collections.abc import Iterator
from datetime import UTC, date, datetime

import pytest
from sqlalchemy import Engine, create_engine, text

from app.application.errores import RecuperacionNoDisponibleError
from app.application.ports import CoberturaDePoblacion
from app.config.settings import POBLACION_MAX_VALORES_POR_CRITERIO_INICIAL as MAX_VALORES
from app.domain.cobertura_poblacion import proporcion_con_criterios
from app.infrastructure.catalog.cobertura_reader import LectorDeCoberturaPostgres
from app.infrastructure.catalog.conexion import crear_motor
from app.infrastructure.catalog.corpus_document_repository import CorpusDocumentRepository
from app.infrastructure.catalog.release_reader import LectorReleasePostgres
from tests.support.pg import BaseDeTest
from tests.support.registros import registro_de_prueba

pytestmark = pytest.mark.servicios_reales

VACIO = {"estadio": "no_disponible", "biomarcadores": {}}
CON_CRITERIOS = {"estadio": "no_disponible", "biomarcadores": {"her2": "positivo"}}
CORTE = date(2026, 10, 16)


@pytest.fixture
def motor(base_migrada: BaseDeTest) -> Iterator[Engine]:
    motor = crear_motor(base_migrada.url_runtime)
    yield motor
    with motor.begin() as conexion:
        conexion.execute(text("DELETE FROM corpus.corpus_document"))
        conexion.execute(text("DELETE FROM corpus.corpus_release"))
    motor.dispose()


def _guardar(motor: Engine, n: int, *, vigente: bool, criterios: dict[str, object]) -> None:
    CorpusDocumentRepository(motor).guardar_documento(
        registro_de_prueba(
            f"cob-{n:02d}@abcdef",
            population_criteria=criterios,
            is_current=vigente,
            checksum=f"{n:064x}",
            version_group_id=f"cob-{n:02d}",
        )
    )


@pytest.mark.ac("US-132", 3)
def test_cobertura_cuenta_7_de_10_documentos_vigentes_y_excluye_los_no_vigentes_cuando_se_lee_con_rag_corpus(
    motor: Engine,
) -> None:
    for n in range(1, 8):
        _guardar(motor, n, vigente=True, criterios=CON_CRITERIOS)
    for n in range(8, 11):
        _guardar(motor, n, vigente=True, criterios=VACIO)
    for n in range(11, 13):
        _guardar(motor, n, vigente=False, criterios=CON_CRITERIOS)

    cobertura = LectorDeCoberturaPostgres(motor, MAX_VALORES).cobertura()

    assert cobertura == CoberturaDePoblacion(vigentes=10, con_criterios=7)
    assert proporcion_con_criterios(cobertura.vigentes, cobertura.con_criterios) == 0.7


def test_cobertura_es_nula_y_sin_vigentes_cuando_el_catalogo_esta_vacio(motor: Engine) -> None:
    cobertura = LectorDeCoberturaPostgres(motor, MAX_VALORES).cobertura()

    assert proporcion_con_criterios(cobertura.vigentes, cobertura.con_criterios) is None


def test_la_version_reportada_es_la_fecha_de_corte_de_la_release_cuando_el_corpus_se_publico_con_ella(
    motor: Engine,
) -> None:
    with motor.begin() as conexion:
        conexion.execute(
            text(
                "INSERT INTO corpus.corpus_release (release_id, cutoff_date, document_count, excluded_sources, published_at) "
                "VALUES ('rel-cob-1', :corte, 0, 'NCCN, ESMO', :publicada)"
            ),
            {"corte": CORTE, "publicada": datetime(2026, 10, 17, tzinfo=UTC)},
        )

    assert LectorReleasePostgres(motor).release_vigente().cutoff_date.isoformat() == "2026-10-16"


def test_cobertura_lanza_recuperacion_no_disponible_sin_cadena_de_conexion_cuando_el_catalogo_no_responde() -> (
    None
):
    caido = create_engine("postgresql+psycopg://rag_corpus@127.0.0.1:1/corpus_inexistente")

    with pytest.raises(RecuperacionNoDisponibleError) as error:
        LectorDeCoberturaPostgres(caido, MAX_VALORES).cobertura()

    assert "127.0.0.1" not in str(error.value) and "rag_corpus" not in str(error.value)
