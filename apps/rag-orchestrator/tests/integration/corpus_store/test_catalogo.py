"""Catálogo del corpus (US-058 AC-1 y AC-4): migración Alembic como ``rag_corpus_migrator`` sobre PostgreSQL real.

Test después (matriz TDD: migración y configuración): el arnés de ``tests/support/pg.py`` crea una base por módulo.
Solo filas sintéticas de FX-06c-a (RN-13, RN-14); ningún NCCN ni ESMO con contenido.
"""

from __future__ import annotations

import re
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, date, datetime
from typing import Any

import pytest
from alembic import command
from sqlalchemy import Connection, text
from sqlalchemy.exc import DBAPIError, IntegrityError, ProgrammingError

from app.infrastructure.catalog.conexion import crear_motor
from app.infrastructure.catalog.tables import DOMINIOS_CERRADOS
from app.schemas.generated.models import LicenseClass
from app.scripts.migrate_corpus_catalog import configuracion_de_alembic, migrar, revision_head
from tests.support.pg import BaseDeTest

pytestmark = pytest.mark.servicios_reales

TEXTO, BOOLEANO, ENTERO, JSONB, FECHA, TIMESTAMPTZ = (
    "text",
    "boolean",
    "integer",
    "jsonb",
    "date",
    "timestamp with time zone",
)

# Lista literal de data-model.md §4.6 (tipo, admite_nulos). Solo las columnas marcadas "nullable" admiten nulos.
COLUMNAS_ESPERADAS: dict[str, dict[str, tuple[str, bool]]] = {
    "corpus_document": {
        "document_id": (TEXTO, False),
        "source_type": (TEXTO, False),
        "source_name": (TEXTO, False),
        "external_id": (TEXTO, False),
        "title": (TEXTO, False),
        "language": (TEXTO, False),
        "license": (TEXTO, False),
        "license_class": (TEXTO, False),
        "license_url": (TEXTO, False),
        "open_access": (BOOLEANO, False),
        "cancer_type_tags": (TEXTO, False),
        "population": (TEXTO, False),
        "study_design": (TEXTO, False),
        "trial_phase": (TEXTO, True),
        "primary_endpoint": (TEXTO, True),
        "sample_size": (ENTERO, True),
        "population_criteria": (JSONB, False),
        "metadata_source": (TEXTO, False),
        "extracted_fields": (JSONB, False),
        "guideline_version": (TEXTO, True),
        "source_url": (TEXTO, True),
        "last_updated_at": (FECHA, True),
        "original_format": (TEXTO, False),
        "object_key_raw": (TEXTO, False),
        "object_key_normalized": (TEXTO, False),
        "checksum": (TEXTO, False),
        "version_group_id": (TEXTO, False),
        "version_label": (TEXTO, False),
        "is_current": (BOOLEANO, False),
        "superseded_at": (TIMESTAMPTZ, True),
        "published_at": (FECHA, False),
        "ingested_at": (TIMESTAMPTZ, False),
        "last_checked_at": (TIMESTAMPTZ, False),
        "status": (TEXTO, False),
    },
    "corpus_release": {
        "release_id": (TEXTO, False),
        "cutoff_date": (FECHA, False),
        "document_count": (ENTERO, False),
        "excluded_sources": (TEXTO, False),
        "published_at": (TIMESTAMPTZ, False),
    },
    "corpus_release_document": {
        "release_id": (TEXTO, False),
        "document_id": (TEXTO, False),
    },
}
ESTADOS_DE_INGESTA = {"pendiente", "normalizado", "embebido", "error", "rechazado_licencia"}
INSTANTE_FIJO = datetime(2026, 10, 16, 12, 0, tzinfo=UTC)


def fila_sintetica(**cambios: Any) -> dict[str, Any]:
    """Un ``corpus_document`` válido y sintético (FX-06c-a); ``cambios`` sobrescribe columnas."""
    fila: dict[str, Any] = {
        "document_id": "doc-sintetico-001",
        "source_type": "guideline",
        "source_name": "Guía pública sintética",
        "external_id": "sintetico-001",
        "title": "Guía sintética de prueba",
        "language": "es",
        "license": "CC BY 4.0",
        "license_class": "cc_by",
        "license_url": "https://example.test/licencia",
        "open_access": True,
        "cancer_type_tags": "mama",
        "population": "adulto",
        "study_design": "guia",
        "trial_phase": None,
        "primary_endpoint": None,
        "sample_size": None,
        "population_criteria": "{}",
        "metadata_source": "fuente_estructurada",
        "guideline_version": None,
        "last_updated_at": None,
        "original_format": "pdf",
        "object_key_raw": "raw/sintetico-001.pdf",
        "object_key_normalized": "normalized/sintetico-001.json",
        "checksum": "0" * 64,
        "version_group_id": "grupo-sintetico-001",
        "version_label": "v1",
        "is_current": True,
        "superseded_at": None,
        "published_at": date(2025, 1, 1),
        "ingested_at": INSTANTE_FIJO,
        "last_checked_at": INSTANTE_FIJO,
        "status": "pendiente",
    }
    return {**fila, **cambios}


def insertar_documento(conexion: Connection, fila: dict[str, Any]) -> None:
    columnas = ", ".join(fila)
    marcadores = ", ".join(
        f"CAST(:{c} AS jsonb)" if c in ("population_criteria", "extracted_fields") else f":{c}"
        for c in fila
    )
    conexion.execute(
        text(f"INSERT INTO corpus.corpus_document ({columnas}) VALUES ({marcadores})"), fila
    )


@contextmanager
def transaccion_revertida(base: BaseDeTest) -> Iterator[Connection]:
    """Conexión del runtime ``rag_corpus`` cuya transacción siempre se revierte: los tests quedan independientes."""
    motor = crear_motor(base.url_runtime)
    try:
        with motor.connect() as conexion:
            transaccion = conexion.begin()
            try:
                yield conexion
            finally:
                transaccion.rollback()
    finally:
        motor.dispose()


def columnas_de(base: BaseDeTest) -> dict[str, dict[str, tuple[str, bool]]]:
    motor = crear_motor(base.url_migrador)
    try:
        with motor.connect() as conexion:
            filas = conexion.execute(
                text(
                    "SELECT table_name, column_name, data_type, is_nullable FROM information_schema.columns "
                    "WHERE table_schema = 'corpus' AND table_name <> 'alembic_version'"
                )
            ).all()
    finally:
        motor.dispose()
    resultado: dict[str, dict[str, tuple[str, bool]]] = {}
    for tabla, columna, tipo, nulos in filas:
        resultado.setdefault(tabla, {})[columna] = (tipo, nulos == "YES")
    return resultado


@pytest.mark.ac("US-058", 1)
def test_corpus_catalog_migracion_sobre_schema_vacio_crea_tres_tablas_con_metadatos_finales(
    base_con_schema_vacio: BaseDeTest,
) -> None:
    migrar(base_con_schema_vacio.url_migrador)

    assert columnas_de(base_con_schema_vacio) == COLUMNAS_ESPERADAS


def test_corpus_catalog_migracion_deja_todas_las_tablas_en_el_schema_corpus(
    base_migrada: BaseDeTest,
) -> None:
    motor = crear_motor(base_migrada.url_migrador)
    try:
        with motor.connect() as conexion:
            propias = conexion.execute(
                text(
                    "SELECT schemaname, tablename FROM pg_tables WHERE tableowner = 'rag_corpus_migrator'"
                )
            ).all()
    finally:
        motor.dispose()

    assert {(schema, tabla) for schema, tabla in propias} == {
        ("corpus", "alembic_version"),
        ("corpus", "corpus_document"),
        ("corpus", "corpus_release"),
        ("corpus", "corpus_release_document"),
    }


def test_corpus_catalog_reaplicar_la_migracion_no_aplica_revisiones_y_alembic_check_queda_limpio(
    base_migrada: BaseDeTest,
) -> None:
    migrar(base_migrada.url_migrador)

    motor = crear_motor(base_migrada.url_migrador)
    try:
        with motor.connect() as conexion:
            versiones = (
                conexion.execute(text("SELECT version_num FROM corpus.alembic_version"))
                .scalars()
                .all()
            )
    finally:
        motor.dispose()
    assert versiones == [revision_head()]
    command.check(
        configuracion_de_alembic(base_migrada.url_migrador)
    )  # lanza CommandError si hay diferencias


def test_corpus_catalog_estado_fuera_del_enum_se_rechaza_por_check_de_status(
    base_migrada: BaseDeTest,
) -> None:
    with transaccion_revertida(base_migrada) as conexion:
        with pytest.raises(IntegrityError) as error:
            insertar_documento(conexion, fila_sintetica(status="indexado"))

    assert error.value.orig.diag.constraint_name == "ck_corpus_document_status"


def test_corpus_catalog_check_de_status_admite_exactamente_los_cinco_estados_del_modelo(
    base_migrada: BaseDeTest,
) -> None:
    assert valores_del_check(base_migrada, "ck_corpus_document_status") == ESTADOS_DE_INGESTA


def valores_del_check(base: BaseDeTest, restriccion: str) -> set[str]:
    motor = crear_motor(base.url_migrador)
    try:
        with motor.connect() as conexion:
            definicion = conexion.execute(
                text("SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = :nombre"),
                {"nombre": restriccion},
            ).scalar_one()
    finally:
        motor.dispose()
    return set(re.findall(r"'([^']+)'::text", definicion))


@pytest.mark.ac("US-058", 1)
def test_corpus_catalog_rag_corpus_lee_y_escribe_tras_migrar(base_migrada: BaseDeTest) -> None:
    motor = crear_motor(base_migrada.url_runtime)
    try:
        with motor.begin() as conexion:
            insertar_documento(conexion, fila_sintetica())
        with motor.begin() as conexion:
            leidos = (
                conexion.execute(text("SELECT document_id FROM corpus.corpus_document"))
                .scalars()
                .all()
            )
        with motor.begin() as conexion:
            borradas = conexion.execute(text("DELETE FROM corpus.corpus_document")).rowcount
    finally:
        motor.dispose()

    assert (leidos, borradas) == (["doc-sintetico-001"], 1)


@pytest.mark.ac("US-058", 1)
def test_corpus_catalog_alembic_como_rag_corpus_falla_por_permission_denied(
    base_con_schema_vacio: BaseDeTest,
) -> None:
    with pytest.raises(DBAPIError) as por_alembic:
        migrar(base_con_schema_vacio.url_runtime)
    motor = crear_motor(base_con_schema_vacio.url_runtime)
    try:
        with motor.connect() as conexion, pytest.raises(ProgrammingError) as por_create:
            conexion.execute(text("CREATE TABLE corpus.t (id int)"))
    finally:
        motor.dispose()

    assert "permission denied" in str(por_alembic.value.orig)
    assert "permission denied" in str(por_create.value.orig)
    assert tablas_del_schema_corpus(base_con_schema_vacio) == []


def tablas_del_schema_corpus(base: BaseDeTest) -> list[str]:
    motor = crear_motor(base.url_migrador)
    try:
        with motor.connect() as conexion:
            return list(
                conexion.execute(
                    text("SELECT tablename FROM pg_tables WHERE schemaname = 'corpus'")
                ).scalars()
            )
    finally:
        motor.dispose()


@pytest.mark.ac("US-058", 4)
def test_corpus_catalog_documento_sin_licencia_se_rechaza_por_not_null(
    base_migrada: BaseDeTest,
) -> None:
    with transaccion_revertida(base_migrada) as conexion:
        with pytest.raises(IntegrityError) as error:
            insertar_documento(conexion, fila_sintetica(license=None))

    assert error.value.orig.diag.column_name == "license"


@pytest.mark.ac("US-058", 4)
def test_corpus_catalog_licencia_nd_se_rechaza_por_check_de_license_class(
    base_migrada: BaseDeTest,
) -> None:
    with transaccion_revertida(base_migrada) as conexion:
        with pytest.raises(IntegrityError) as error:
            insertar_documento(conexion, fila_sintetica(license_class="cc_by_nd"))

    assert error.value.orig.diag.constraint_name == "ck_corpus_document_license_class"


@pytest.mark.ac("US-058", 4)
def test_corpus_catalog_clases_de_licencia_del_esquema_coinciden_con_el_contrato(
    base_migrada: BaseDeTest,
) -> None:
    assert valores_del_check(base_migrada, "ck_corpus_document_license_class") == {
        c.value for c in LicenseClass
    }


@pytest.mark.parametrize("columna", sorted(DOMINIOS_CERRADOS))
def test_corpus_catalog_check_migrado_coincide_con_los_dominios_cerrados_de_tables(
    base_migrada: BaseDeTest, columna: str
) -> None:
    assert valores_del_check(base_migrada, f"ck_corpus_document_{columna}") == set(
        DOMINIOS_CERRADOS[columna]
    )
