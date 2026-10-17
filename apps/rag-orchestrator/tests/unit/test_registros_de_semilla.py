"""Filas del catálogo y chunks de la semilla (US-059): metadatos copiados del documento, nunca inferidos (RN-04, RN-25)."""

from __future__ import annotations

from datetime import date

from app.application.seed_corpus.registros import (
    chunks_del_documento,
    registro_con_error,
    registro_embebido,
    registro_rechazado,
)
from app.domain.corpus_seed.admisibilidad import Admision
from tests.support.registros import AHORA
from tests.support.semilla import documento_de_prueba

ADMITIDO = Admision(None, "dominio_publico")
CHECKSUM = "ab" * 32


def test_el_registro_embebido_es_vigente_con_los_metadatos_y_las_llaves_de_objeto_vacias() -> None:
    documento = documento_de_prueba(
        cancer_type_tags=("mama", "prostata"),
        population_criteria={"estadio": "metastasico"},
    )

    registro = registro_embebido(documento, ADMITIDO, CHECKSUM, AHORA)

    assert (registro.status, registro.is_current, registro.open_access) == ("embebido", True, True)
    assert registro.document_id == f"d-1@{CHECKSUM[:12]}" and registro.checksum == CHECKSUM
    assert (registro.license_class, registro.metadata_source) == (
        "dominio_publico",
        "fuente_estructurada",
    )
    assert (registro.object_key_raw, registro.object_key_normalized) == ("", "")
    assert registro.cancer_type_tags == "mama,prostata" and registro.original_format == "html"
    assert registro.population_criteria["estadio"] == "metastasico"
    assert registro.population_criteria["linea"] == "no_disponible"
    assert (registro.ingested_at, registro.last_checked_at, registro.superseded_at) == (
        AHORA,
        AHORA,
        None,
    )


def test_la_etiqueta_de_version_por_defecto_es_la_fecha_de_publicacion() -> None:
    registro = registro_embebido(documento_de_prueba(), ADMITIDO, CHECKSUM, AHORA)

    assert registro.version_label == date(2025, 1, 15).isoformat()


def test_el_registro_rechazado_lleva_solo_metadatos_sin_checksum_y_nunca_es_vigente() -> None:
    documento = documento_de_prueba(source_name="NCCN", license="Dominio público")

    registro = registro_rechazado(documento, AHORA)

    assert registro.status == "rechazado_licencia" and registro.is_current is False
    assert registro.checksum == "" and registro.document_id == "d-1@rechazado"
    assert registro.license == "Dominio público" and registro.open_access is False
    assert (
        registro.license_class == "cc_by_nc"
    )  # la más restrictiva: el CHECK exige una de las cuatro


def test_un_rechazado_sin_licencia_guarda_la_licencia_como_texto_vacio_no_nulo() -> None:
    registro = registro_rechazado(documento_de_prueba(license=None, license_url=None), AHORA)

    assert (registro.license, registro.license_url) == ("", "")


def test_el_registro_con_error_usa_el_identificador_del_contenido_si_hay_checksum() -> None:
    con_checksum = registro_con_error(documento_de_prueba(), ADMITIDO, CHECKSUM, AHORA)
    sin_checksum = registro_con_error(documento_de_prueba(), ADMITIDO, None, AHORA)

    assert con_checksum.document_id == f"d-1@{CHECKSUM[:12]}"
    assert sin_checksum.document_id == "d-1@error" and sin_checksum.checksum == ""
    assert (con_checksum.status, con_checksum.is_current) == ("error", False)


def test_cada_chunk_copia_los_metadatos_denormalizados_del_documento() -> None:
    registro = registro_embebido(
        documento_de_prueba(cancer_type_tags=("mama",), language="es"), ADMITIDO, CHECKSUM, AHORA
    )

    chunks = chunks_del_documento(registro, ["uno", "dos"], [[0.1] * 8, [0.2] * 8], AHORA)

    assert [c.chunk_id for c in chunks] == [
        f"{registro.document_id}#0000",
        f"{registro.document_id}#0001",
    ]
    for chunk in chunks:
        assert (chunk.document_id, chunk.source_type, chunk.language) == (
            registro.document_id,
            registro.source_type,
            registro.language,
        )
        assert (chunk.cancer_type_tags, chunk.population, chunk.study_design) == (
            registro.cancer_type_tags,
            registro.population,
            registro.study_design,
        )
        assert (chunk.published_year, chunk.is_current) == (2025, True)
        assert chunk.created_at_ms == int(AHORA.timestamp() * 1000)


def test_los_vectores_se_asignan_a_los_fragmentos_en_orden() -> None:
    registro = registro_embebido(documento_de_prueba(), ADMITIDO, CHECKSUM, AHORA)

    chunks = chunks_del_documento(registro, ["uno", "dos"], [[1.0] * 8, [2.0] * 8], AHORA)

    assert [(c.chunk_text, c.dense_vector[0]) for c in chunks] == [("uno", 1.0), ("dos", 2.0)]
