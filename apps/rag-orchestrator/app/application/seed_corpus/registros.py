"""Construcción de las filas del catálogo y de los chunks a partir de un documento del manifiesto (US-059).

Sin I/O: recibe el instante (del reloj inyectado) y devuelve valores. ``object_key_raw`` y ``object_key_normalized`` van
vacíos en el S1 porque la semilla no persiste originales en MinIO (lectura revisada de Q9/D4, decidido por el usuario,
2026-10-20; los originales llegan con US-117, S4). ``metadata_source`` es siempre ``fuente_estructurada``: la semilla no
extrae nada con LLM.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from datetime import datetime

from app.application.ports import ChunkDelCorpus
from app.application.seed_corpus.ports import RegistroDeDocumento
from app.domain.corpus_metadata.origen import metadatos_de_la_fuente
from app.domain.corpus_metadata.resultado import FUENTE_ESTRUCTURADA, MetadatosResueltos
from app.domain.corpus_seed.admisibilidad import Admision, ClaseDeLicencia
from app.domain.corpus_seed.documento import DocumentoDeSemilla
from app.domain.corpus_seed.versionado import (
    STATUS_EMBEBIDO,
    STATUS_ERROR,
    STATUS_NORMALIZADO,
    STATUS_RECHAZADO,
)

ORIGEN_DE_LA_SEMILLA = FUENTE_ESTRUCTURADA
SECCION_UNICA = "texto_completo"
# La columna ``license_class`` es NOT NULL con CHECK sobre cuatro valores y ``rechazado_licencia`` no tiene clase propia
# (el catálogo no cambia en este change): un rechazado lleva la más restrictiva. La verdad de su licencia es el texto
# literal de ``license`` y su ``status``; nunca es vigente ni tiene chunks.
CLASE_DE_LICENCIA_DE_RECHAZADOS = ClaseDeLicencia.CC_BY_NC


def identificador_de_documento(document_key: str, checksum: str) -> str:
    """Estable: el mismo contenido da el mismo identificador (reintentos); un contenido nuevo, uno nuevo."""
    return f"{document_key}@{checksum[:12]}"


def identificador_de_rechazado(document_key: str) -> str:
    return f"{document_key}@rechazado"


def identificador_de_error(document_key: str) -> str:
    return f"{document_key}@error"


def registro_embebido(
    documento: DocumentoDeSemilla,
    admision: Admision,
    checksum: str,
    ahora: datetime,
    metadatos: MetadatosResueltos | None = None,
) -> RegistroDeDocumento:
    """``metadatos`` (US-118) los entrega el paso de metadatos de la ingesta; sin él, lo que publica el manifiesto."""
    clase = _clase_de_un_admitido(admision)
    return _registro(
        documento,
        identificador_de_documento(documento.document_key, checksum),
        ahora,
        license_class=clase,
        checksum=checksum,
        status=STATUS_EMBEBIDO,
        is_current=True,
        open_access=True,
        metadatos=metadatos,
    )


def registro_rechazado(documento: DocumentoDeSemilla, ahora: datetime) -> RegistroDeDocumento:
    """Solo metadatos del manifiesto: ni texto ni checksum (no se descarga lo que no se puede usar)."""
    return _registro(
        documento,
        identificador_de_rechazado(documento.document_key),
        ahora,
        license_class=CLASE_DE_LICENCIA_DE_RECHAZADOS,
        checksum="",
        status=STATUS_RECHAZADO,
        is_current=False,
        open_access=False,
    )


def registro_con_error(
    documento: DocumentoDeSemilla, admision: Admision, checksum: str | None, ahora: datetime
) -> RegistroDeDocumento:
    clase = _clase_de_un_admitido(admision)
    identificador = (
        identificador_de_documento(documento.document_key, checksum)
        if checksum
        else identificador_de_error(documento.document_key)
    )
    return _registro(
        documento,
        identificador,
        ahora,
        license_class=clase,
        checksum=checksum or "",
        status=STATUS_ERROR,
        is_current=False,
        open_access=True,
    )


def registro_normalizado(
    documento: DocumentoDeSemilla, admision: Admision, checksum: str, ahora: datetime
) -> RegistroDeDocumento:
    """*Checkpoint* de la ingesta en lote (US-117a D2): texto leído y normalizado, aún sin chunks confirmados."""
    return _registro(
        documento,
        identificador_de_documento(documento.document_key, checksum),
        ahora,
        license_class=_clase_de_un_admitido(admision),
        checksum=checksum,
        status=STATUS_NORMALIZADO,
        is_current=False,
        open_access=True,
    )


def _clase_de_un_admitido(admision: Admision) -> str:
    if admision.license_class is None:
        raise ValueError("un documento admitido siempre tiene license_class")
    return admision.license_class


def _registro(
    documento: DocumentoDeSemilla,
    document_id: str,
    ahora: datetime,
    *,
    license_class: str,
    checksum: str,
    status: str,
    is_current: bool,
    open_access: bool,
    metadatos: MetadatosResueltos | None = None,
) -> RegistroDeDocumento:
    metadatos = metadatos or metadatos_de_la_fuente(documento)
    return RegistroDeDocumento(
        document_id=document_id,
        source_type=documento.source_type,
        source_name=documento.source_name,
        external_id=documento.external_id,
        title=documento.title,
        language=documento.language,
        license=documento.license or "",
        license_class=license_class,
        license_url=documento.license_url or "",
        open_access=open_access,
        cancer_type_tags=etiquetas_de_cancer(documento),
        population=documento.population,
        study_design=metadatos.study_design,
        trial_phase=metadatos.trial_phase,
        primary_endpoint=metadatos.primary_endpoint,
        sample_size=metadatos.sample_size,
        population_criteria=metadatos.population_criteria,
        metadata_source=metadatos.metadata_source,
        guideline_version=documento.guideline_version,
        last_updated_at=documento.last_updated_at,
        original_format=documento.original_format,
        object_key_raw="",
        object_key_normalized="",
        checksum=checksum,
        version_group_id=documento.version_group_id,
        version_label=documento.version_label or documento.published_at.isoformat(),
        is_current=is_current,
        superseded_at=None,
        published_at=documento.published_at,
        ingested_at=ahora,
        last_checked_at=ahora,
        status=status,
        source_url=documento.url_original,
    )


def etiquetas_de_cancer(documento: DocumentoDeSemilla) -> str:
    """Formato de ``cancer_type_tags`` en el catálogo y en Milvus: etiquetas separadas por coma, sin espacios."""
    return ",".join(documento.cancer_type_tags)


def chunks_del_documento(
    registro: RegistroDeDocumento,
    fragmentos: Sequence[str],
    vectores: Sequence[Sequence[float]],
    ahora: datetime,
    vectores_sparse: Sequence[Mapping[int, float]] | None = None,
) -> list[ChunkDelCorpus]:
    """Chunks listos para Milvus con los metadatos denormalizados COPIADOS del registro del documento (RN-04, RN-25).

    ``vectores_sparse`` (uno por fragmento, mismo orden) lo entrega la ingesta en lote (US-117a); la semilla no lo pasa.
    """
    sparse = vectores_sparse if vectores_sparse is not None else [None] * len(fragmentos)
    return [
        ChunkDelCorpus(
            chunk_id=f"{registro.document_id}#{indice:04d}",
            document_id=registro.document_id,
            dense_vector=vector,
            chunk_text=fragmento,
            chunk_index=indice,
            section=SECCION_UNICA,
            source_type=registro.source_type,
            language=registro.language,
            cancer_type_tags=registro.cancer_type_tags,
            population=registro.population,
            study_design=registro.study_design,
            published_year=registro.published_at.year,
            is_current=registro.is_current,
            created_at_ms=int(ahora.timestamp() * 1000),
            sparse_vector=vector_sparse,
        )
        for indice, (fragmento, vector, vector_sparse) in enumerate(
            zip(fragmentos, vectores, sparse, strict=True)
        )
    ]
