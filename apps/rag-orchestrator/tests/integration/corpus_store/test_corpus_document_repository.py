"""``CorpusDocumentRepository`` contra el PostgreSQL ``corpus`` real como ``rag_corpus`` (US-059, test después).

Solo filas sintéticas. Cada test limpia con el rol de runtime (tiene DML); la base migrada es de módulo.
"""

from __future__ import annotations

from collections.abc import Iterator
from datetime import UTC, date, datetime, timedelta

import pytest
from sqlalchemy import Engine, text

from app.application.seed_corpus.ports import RegistroDeRelease
from app.domain.corpus_seed.versionado import VersionExistente
from app.infrastructure.catalog.conexion import crear_motor
from app.infrastructure.catalog.corpus_document_repository import CorpusDocumentRepository
from tests.support.pg import BaseDeTest
from tests.support.registros import AHORA, registro_de_prueba

pytestmark = pytest.mark.servicios_reales


@pytest.fixture
def motor(base_migrada: BaseDeTest) -> Iterator[Engine]:
    motor = crear_motor(base_migrada.url_runtime)
    yield motor
    with motor.begin() as conexion:
        for tabla in ("corpus_release_document", "corpus_release", "corpus_document"):
            conexion.execute(text(f"DELETE FROM corpus.{tabla}"))
    motor.dispose()


@pytest.fixture
def repositorio(motor: Engine) -> CorpusDocumentRepository:
    return CorpusDocumentRepository(motor)


def test_guardar_dos_veces_el_mismo_documento_deja_una_fila_con_la_ultima_version(
    repositorio: CorpusDocumentRepository, motor: Engine
) -> None:
    repositorio.guardar_documento(registro_de_prueba(status="error", is_current=False))
    repositorio.guardar_documento(registro_de_prueba())

    with motor.connect() as conexion:
        filas = conexion.execute(
            text("SELECT status, is_current FROM corpus.corpus_document")
        ).all()
    assert [tuple(f) for f in filas] == [("embebido", True)]


def test_guarda_el_jsonb_de_poblacion_y_las_fechas_tal_como_llegan(
    repositorio: CorpusDocumentRepository, motor: Engine
) -> None:
    repositorio.guardar_documento(
        registro_de_prueba(population_criteria={"estadio": "metastasico", "linea": "primera"})
    )

    with motor.connect() as conexion:
        fila = conexion.execute(
            text(
                "SELECT population_criteria, published_at, ingested_at FROM corpus.corpus_document"
            )
        ).one()
    assert fila.population_criteria == {"estadio": "metastasico", "linea": "primera"}
    assert fila.published_at == date(2025, 1, 15) and fila.ingested_at == AHORA


def test_versiones_del_grupo_devuelve_solo_las_del_grupo_con_su_estado(
    repositorio: CorpusDocumentRepository,
) -> None:
    repositorio.guardar_documento(registro_de_prueba("a@1", version_group_id="g1", checksum="c1"))
    repositorio.guardar_documento(registro_de_prueba("b@1", version_group_id="g2", checksum="c2"))

    assert repositorio.versiones_del_grupo("g1") == [
        VersionExistente("a@1", "c1", True, "embebido")
    ]
    assert repositorio.versiones_del_grupo("sin-grupo") == []


def test_reemplazar_version_guarda_la_nueva_y_apaga_la_anterior_sin_borrar_nada(
    repositorio: CorpusDocumentRepository, motor: Engine
) -> None:
    repositorio.guardar_documento(registro_de_prueba("a@1", version_group_id="g", checksum="c1"))
    segundo_instante = datetime(2026, 10, 17, 9, 30, tzinfo=UTC)

    repositorio.reemplazar_version(
        registro_de_prueba("a@2", version_group_id="g", checksum="c2"), "a@1", segundo_instante
    )

    with motor.connect() as conexion:
        filas = conexion.execute(
            text(
                "SELECT document_id, is_current, superseded_at FROM corpus.corpus_document ORDER BY document_id"
            )
        ).all()
    assert [tuple(f) for f in filas] == [("a@1", False, segundo_instante), ("a@2", True, None)]


def test_los_vigentes_son_solo_los_embebidos_con_is_current(
    repositorio: CorpusDocumentRepository,
) -> None:
    repositorio.guardar_documento(registro_de_prueba("vigente@1"))
    repositorio.guardar_documento(registro_de_prueba("viejo@1", is_current=False))
    repositorio.guardar_documento(
        registro_de_prueba("rechazado@1", is_current=False, status="rechazado_licencia")
    )
    repositorio.guardar_documento(
        registro_de_prueba("con-error@1", is_current=True, status="error")
    )

    assert repositorio.ids_de_documentos_vigentes() == frozenset({"vigente@1"})


def test_publicar_release_guarda_corte_fuentes_excluidas_y_una_fila_por_documento(
    repositorio: CorpusDocumentRepository, motor: Engine
) -> None:
    repositorio.guardar_documento(registro_de_prueba("a@1"))
    repositorio.guardar_documento(registro_de_prueba("b@1", version_group_id="b"))

    repositorio.publicar_release(
        RegistroDeRelease("r-1", date(2026, 10, 15), ("NCCN", "ESMO"), AHORA, ("a@1", "b@1"))
    )

    with motor.connect() as conexion:
        release = conexion.execute(text("SELECT * FROM corpus.corpus_release")).one()
        documentos = (
            conexion.execute(
                text("SELECT document_id FROM corpus.corpus_release_document ORDER BY 1")
            )
            .scalars()
            .all()
        )
    assert (release.cutoff_date, release.document_count, release.excluded_sources) == (
        date(2026, 10, 15),
        2,
        '["NCCN", "ESMO"]',
    )
    assert documentos == ["a@1", "b@1"]


def test_la_ultima_release_es_la_mas_reciente_y_sin_releases_es_none(
    repositorio: CorpusDocumentRepository,
) -> None:
    repositorio.guardar_documento(registro_de_prueba("a@1"))
    repositorio.guardar_documento(registro_de_prueba("b@1", version_group_id="b"))
    assert repositorio.ids_de_la_ultima_release() is None

    repositorio.publicar_release(RegistroDeRelease("r-1", date(2026, 10, 15), (), AHORA, ("a@1",)))
    repositorio.publicar_release(
        RegistroDeRelease("r-2", date(2026, 10, 15), (), AHORA + timedelta(hours=1), ("a@1", "b@1"))
    )

    assert repositorio.ids_de_la_ultima_release() == frozenset({"a@1", "b@1"})
