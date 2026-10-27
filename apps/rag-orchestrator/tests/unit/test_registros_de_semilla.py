"""Filas del catálogo y chunks de la semilla (US-059): metadatos copiados del documento, nunca inferidos (RN-04, RN-25)."""

from __future__ import annotations

from datetime import date

from app.application.seed_corpus.registros import (
    CLASE_DE_LICENCIA_DE_RECHAZADOS,
    chunks_del_documento,
    registro_con_error,
    registro_embebido,
    registro_normalizado,
    registro_rechazado,
)
from app.config.settings import CLASES_DE_LICENCIA
from app.domain.corpus_metadata.origen import metadatos_de_la_fuente
from app.domain.corpus_metadata.resultado import EXTRAIDO_VERIFICADO, FUENTE_ESTRUCTURADA, PENDIENTE
from app.domain.corpus_seed.admisibilidad import Admision
from app.domain.corpus_seed.versionado import (
    STATUS_A_MEDIAS,
    STATUS_EMBEBIDO,
    STATUS_RECHAZADO,
)
from app.infrastructure.catalog.tables import DOMINIOS_CERRADOS
from tests.support.registros import AHORA
from tests.support.semilla import documento_de_prueba

ADMITIDO = Admision(None, "dominio_publico")
CHECKSUM = "ab" * 32


def test_los_valores_fijos_de_las_filas_pertenecen_a_los_dominios_cerrados_del_catalogo() -> None:
    """Si el catálogo cambia un dominio, la semilla falla aquí y no en el ``CHECK`` de PostgreSQL en plena carga."""
    assert STATUS_A_MEDIAS | {STATUS_EMBEBIDO, STATUS_RECHAZADO} == set(DOMINIOS_CERRADOS["status"])
    assert CLASE_DE_LICENCIA_DE_RECHAZADOS in DOMINIOS_CERRADOS["license_class"]
    assert {FUENTE_ESTRUCTURADA, EXTRAIDO_VERIFICADO, PENDIENTE} == set(
        DOMINIOS_CERRADOS["metadata_source"]
    )
    assert set(CLASES_DE_LICENCIA) == set(DOMINIOS_CERRADOS["license_class"])


def test_el_registro_embebido_es_vigente_con_los_metadatos_y_las_llaves_de_objeto_vacias() -> None:
    documento = documento_de_prueba(
        cancer_type_tags=("mama", "prostata"),
        population_criteria={"estadio": "metastasico"},
    )

    registro = registro_embebido(
        documento, ADMITIDO, CHECKSUM, AHORA, metadatos_de_la_fuente(documento)
    )

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
    documento = documento_de_prueba()
    registro = registro_embebido(
        documento, ADMITIDO, CHECKSUM, AHORA, metadatos_de_la_fuente(documento)
    )

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
    documento = documento_de_prueba(cancer_type_tags=("mama",), language="es")
    registro = registro_embebido(
        documento, ADMITIDO, CHECKSUM, AHORA, metadatos_de_la_fuente(documento)
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
    documento = documento_de_prueba()
    registro = registro_embebido(
        documento, ADMITIDO, CHECKSUM, AHORA, metadatos_de_la_fuente(documento)
    )

    chunks = chunks_del_documento(registro, ["uno", "dos"], [[1.0] * 8, [2.0] * 8], AHORA)

    assert [(c.chunk_text, c.dense_vector[0]) for c in chunks] == [("uno", 1.0), ("dos", 2.0)]


def test_la_clase_de_licencia_del_dominio_coincide_con_la_del_contrato_generado() -> None:
    from app.domain.corpus_seed.admisibilidad import ClaseDeLicencia
    from app.schemas.generated.models import LicenseClass

    assert {c.value for c in ClaseDeLicencia} == {c.value for c in LicenseClass}


def test_el_registro_embebido_copia_la_url_original_del_documento_en_source_url() -> None:
    documento = documento_de_prueba(
        url_original="https://www.cancer.gov/types/breast/hp/breast-treatment-pdq"
    )

    registro = registro_embebido(
        documento, ADMITIDO, CHECKSUM, AHORA, metadatos_de_la_fuente(documento)
    )

    assert registro.source_url == "https://www.cancer.gov/types/breast/hp/breast-treatment-pdq"


def test_el_registro_normalizado_es_el_checkpoint_no_vigente_con_el_identificador_del_contenido() -> (
    None
):
    documento = documento_de_prueba()
    registro = registro_normalizado(documento, ADMITIDO, CHECKSUM, AHORA)

    assert (
        registro.document_id
        == registro_embebido(
            documento, ADMITIDO, CHECKSUM, AHORA, metadatos_de_la_fuente(documento)
        ).document_id
    )
    assert (registro.status, registro.is_current, registro.checksum) == (
        "normalizado",
        False,
        CHECKSUM,
    )


def test_cada_chunk_lleva_el_vector_sparse_de_su_fragmento_cuando_se_entrega() -> None:
    documento = documento_de_prueba()
    registro = registro_embebido(
        documento, ADMITIDO, CHECKSUM, AHORA, metadatos_de_la_fuente(documento)
    )

    chunks = chunks_del_documento(
        registro, ["uno", "dos"], [[1.0] * 8, [2.0] * 8], AHORA, [{7: 0.5}, {9: 0.25}]
    )

    assert [c.sparse_vector for c in chunks] == [{7: 0.5}, {9: 0.25}]


def test_los_chunks_de_la_semilla_siguen_sin_vector_sparse() -> None:
    documento = documento_de_prueba()
    registro = registro_embebido(
        documento, ADMITIDO, CHECKSUM, AHORA, metadatos_de_la_fuente(documento)
    )

    chunks = chunks_del_documento(registro, ["uno"], [[1.0] * 8], AHORA)

    assert chunks[0].sparse_vector is None
