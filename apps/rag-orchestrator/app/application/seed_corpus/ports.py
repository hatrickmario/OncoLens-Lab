"""Puertos del cargador de la semilla (US-059, L1D-115). Los adapters concretos viven en ``app/infrastructure``.

El servicio no importa ``pymilvus``, ``httpx`` ni SQLAlchemy: solo estos puertos y las reglas de ``domain/corpus_seed``.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any, Protocol

from app.application.ports import ChunkDelCorpus
from app.domain.corpus_seed.documento import DocumentoDeSemilla
from app.domain.corpus_seed.versionado import VersionExistente


class VersionInexistente(LookupError):
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


class ChunkStoreDeIngesta(Protocol):
    """Lo que la ingesta necesita del almacén vectorial: escribir chunks y apagar la vigencia (RN-05).

    ``MilvusRepository`` lo cumple junto con ``CorpusChunkStore``; la ingesta no depende de la búsqueda ni de la colección.
    """

    def upsert_chunks(self, chunks: Sequence[ChunkDelCorpus]) -> int:
        """Inserta o reescribe por ``chunk_id``: idempotente (reintentos) y deja vigentes los de una readmisión."""
        ...

    def marcar_no_vigentes(self, document_id: str) -> int:
        """Pone ``is_current = false`` a los chunks del documento SIN borrar ninguno. Devuelve cuántos cambió."""
        ...

    def marcar_vigentes(self, document_id: str) -> int:
        """Pone ``is_current = true`` a los chunks del documento SIN borrar ninguno (reconciliación). Devuelve cuántos cambió."""
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
    population_criteria: Mapping[str, Any]
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
    # URL pública del documento original (data-model §4.6); ausente = la UI muestra "No disponible" (RN-25).
    source_url: str | None = None
    # Nombres de los campos de ``population_criteria``/escalares que el LLM extrajo y el NLI verificó (no los declarados por el
    # manifiesto). Decidido (usuario, 2026-10-24): la muestra de M-08.4 se construye solo desde estos.
    extracted_fields: tuple[str, ...] = ()
    # Forma de ``population_criteria`` (migración 0005, US-241): ``antigua`` = un valor por criterio; ``lista`` = lista
    # acotada por criterio (US-242). Informativa: el lector decide por la forma del JSON.
    population_form: str = "antigua"


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

        Lanza ``VersionInexistente`` (y no guarda nada) si ``anterior_id`` no existe.
        """
        ...

    def retirar_version(self, document_id: str, superseded_at: datetime) -> None:
        """Marca ``is_current = false`` + ``superseded_at`` SIN borrar nada (RN-05, RN-21).

        Lanza ``VersionInexistente`` si el documento no existe.
        """
        ...

    def ids_de_documentos_vigentes(self) -> frozenset[str]: ...

    def ids_de_la_ultima_release(self) -> frozenset[str] | None:
        """Documentos de la release más reciente, o ``None`` si nunca se publicó una."""
        ...

    def publicar_release(self, release: RegistroDeRelease) -> None: ...


class LectorDeDocumentosExtraidos(Protocol):
    """Lectura de la muestra de metadatos (US-118 AC-5), aparte de ``CorpusCatalog`` (ISP, deuda 5.4 de L1D-117).

    El catálogo SQL y el fake en memoria lo cumplen además de ``CorpusCatalog``; la muestra solo depende de este puerto.
    """

    def documentos_extraidos_de_la_release(self, release_id: str) -> list[RegistroDeDocumento]:
        """Filas de los documentos de la release con ``metadata_source = extraido_verificado`` (fuente de la muestra humana,
        US-118 AC-5), ordenadas por ``document_id``. Release inexistente: lista vacía."""
        ...
