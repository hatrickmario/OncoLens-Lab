"""Puertos del cargador de la semilla (US-059, L1D-115). Los adapters concretos viven en ``app/infrastructure``.

El servicio no importa ``pymilvus``, ``httpx`` ni SQLAlchemy: solo estos puertos y las reglas de ``domain/corpus_seed``.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import date, datetime
from typing import Protocol

from app.application.ports import CorpusChunkStore
from app.domain.corpus_seed.documento import DocumentoDeSemilla
from app.domain.corpus_seed.versionado import VersionExistente


class VersionAnteriorInexistente(LookupError):
    """``reemplazar_version`` recibió un ``anterior_id`` que no existe: no se guardó nada (la transacción se revierte)."""


class IdGenerator(Protocol):
    """Genera identificadores (el de la release); inyectado para que los tests lo congelen."""

    def nuevo(self) -> str: ...


class PassageEmbedder(Protocol):
    """Embeddings dense de PASAJES (no de preguntas: ese es el ``QueryEmbedder`` de L1D-106).

    Devuelve un vector por texto, en el mismo orden. El adapter real aplica el prefijo de pasaje si el modelo lo exige.
    """

    def embeber(self, textos: Sequence[str]) -> list[list[float]]: ...


class SourceFetcher(Protocol):
    """Entrega el texto de un documento del manifiesto. Lanza una excepción si no puede leerlo."""

    def obtener_texto(self, documento: DocumentoDeSemilla) -> str: ...


class ChunkStore(CorpusChunkStore, Protocol):
    """``CorpusChunkStore`` más lo que necesita el versionado (RN-05): consultar y apagar chunks por documento."""

    def ids_de_chunks_del_documento(self, document_id: str) -> frozenset[str]: ...

    def marcar_no_vigentes(self, document_id: str) -> int:
        """Pone ``is_current = false`` a los chunks del documento SIN borrar ninguno. Devuelve cuántos cambió."""
        ...


@dataclass(frozen=True)
class RegistroDeDocumento:
    """Una fila de ``corpus.corpus_document`` (data-model §4.6)."""

    document_id: str
    source_type: str
    source_name: str
    external_id: str
    title: str
    language: str
    license: str
    license_class: str
    license_url: str
    open_access: bool
    cancer_type_tags: str
    population: str
    study_design: str
    trial_phase: str | None
    primary_endpoint: str | None
    sample_size: int | None
    population_criteria: Mapping[str, str]
    metadata_source: str
    guideline_version: str | None
    last_updated_at: date | None
    original_format: str
    object_key_raw: str
    object_key_normalized: str
    checksum: str
    version_group_id: str
    version_label: str
    is_current: bool
    superseded_at: datetime | None
    published_at: date
    ingested_at: datetime
    last_checked_at: datetime
    status: str


@dataclass(frozen=True)
class RegistroDeRelease:
    release_id: str
    cutoff_date: date
    excluded_sources: tuple[str, ...]
    published_at: datetime
    document_ids: tuple[str, ...]


class CorpusCatalog(Protocol):
    """Catálogo ``corpus`` en PostgreSQL. Un fallo de este puerto ABORTA la carga (no se traga por documento)."""

    def versiones_del_grupo(self, version_group_id: str) -> list[VersionExistente]: ...

    def guardar_documento(self, registro: RegistroDeDocumento) -> None:
        """Inserta o, si el ``document_id`` ya existe (reintento tras un fallo), lo reemplaza entero."""
        ...

    def reemplazar_version(
        self, nuevo: RegistroDeDocumento, anterior_id: str, superseded_at: datetime
    ) -> None:
        """En UNA transacción: guarda el nuevo y marca el anterior ``is_current = false`` + ``superseded_at``.

        Lanza ``VersionAnteriorInexistente`` (y no guarda nada) si ``anterior_id`` no existe.
        """
        ...

    def ids_de_documentos_vigentes(self) -> frozenset[str]: ...

    def ids_de_la_ultima_release(self) -> frozenset[str] | None:
        """Documentos de la release más reciente, o ``None`` si nunca se publicó una."""
        ...

    def publicar_release(self, release: RegistroDeRelease) -> None: ...
