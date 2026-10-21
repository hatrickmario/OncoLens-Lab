"""Citas de una opción (RN-01, RN-04): reglas puras, sin E/S y sin reloj.

El LLM solo aporta el ``chunkId`` de cada cita; todo lo demás se copia del corpus. Una opción se acepta solo con
citas a chunks recuperados en esta consulta, y las que no, se descartan con su motivo.
"""

from __future__ import annotations

from collections.abc import Collection, Sequence
from dataclasses import dataclass
from datetime import date
from enum import StrEnum

from app.domain.relevance import ChunkPuntuado


@dataclass(frozen=True)
class OpcionGenerada:
    """Opción tal como la entrega el generador: texto y los ``chunkId`` citados; nada más del LLM sobrevive."""

    option: str
    rationale: str
    chunk_ids_citados: tuple[str, ...]
    # Párrafos opcionales que amplían la justificación (ARR-08): se validan como el resto de lo generado (RN-01, RN-23).
    details: tuple[str, ...] = ()


class MotivoDeDescarte(StrEnum):
    sin_citas = "sin_citas"
    cita_invalida = "cita_invalida"


@dataclass(frozen=True)
class OpcionAceptada:
    opcion: OpcionGenerada
    chunk_ids_validos: tuple[str, ...]


@dataclass(frozen=True)
class OpcionDescartada:
    opcion: OpcionGenerada
    motivo: MotivoDeDescarte


@dataclass(frozen=True)
class ResultadoCitas:
    aceptadas: tuple[OpcionAceptada, ...]
    descartadas: tuple[OpcionDescartada, ...]


@dataclass(frozen=True)
class FichaDeFuente:
    """Metadatos de un documento del catálogo (``corpus.corpus_document``). Ausente = ``None``, nunca cadena vacía."""

    title: str
    source_name: str
    external_id: str
    language: str
    source_type: str
    license_class: str
    study_design: str | None
    trial_phase: str | None
    primary_endpoint: str | None
    sample_size: int | None
    published_at: date | None
    last_updated_at: date | None
    guideline_version: str | None
    authors: str | None
    source_url: str | None


@dataclass(frozen=True)
class CitaDelCorpus:
    """Una cita lista para el contrato (``CitedSource``): campos con los nombres del contrato."""

    title: str
    sourceName: str
    externalId: str
    language: str
    sourceType: str
    licenseClass: str
    studyDesign: str | None
    trialPhase: str | None
    primaryEndpoint: str | None
    sampleSize: int | None
    publishedAt: date | None
    lastUpdatedAt: date | None
    guidelineVersion: str | None
    authors: str | None
    sourceUrl: str | None
    possiblyOutdated: bool
    newerVersionAvailable: bool
    chunkTextSnapshot: str
    chunkId: str


def validar_citas(
    opciones: Sequence[OpcionGenerada], chunk_ids_citables: Collection[str]
) -> ResultadoCitas:
    """Reparte las opciones en aceptadas (con solo sus citas válidas) y descartadas con su motivo (RN-01).

    ``chunk_ids_citables`` son los chunks recuperados en esta consulta y entregados a la generación; la regla no
    consulta ninguna fuente para decidir (un análisis previo nunca está en ese conjunto, RN-24).
    """
    aceptadas: list[OpcionAceptada] = []
    descartadas: list[OpcionDescartada] = []
    for opcion in opciones:
        if not opcion.chunk_ids_citados:
            descartadas.append(OpcionDescartada(opcion, MotivoDeDescarte.sin_citas))
            continue
        validos = tuple(
            dict.fromkeys(c for c in opcion.chunk_ids_citados if c in chunk_ids_citables)
        )
        if validos:
            aceptadas.append(OpcionAceptada(opcion, validos))
        else:
            descartadas.append(OpcionDescartada(opcion, MotivoDeDescarte.cita_invalida))
    return ResultadoCitas(tuple(aceptadas), tuple(descartadas))


def construir_cita(chunk: ChunkPuntuado, ficha: FichaDeFuente) -> CitaDelCorpus:
    """Cita copiada del catálogo y del chunk recuperado; nada viene del texto generado (RN-04, RN-25)."""
    return CitaDelCorpus(
        title=ficha.title,
        sourceName=ficha.source_name,
        externalId=ficha.external_id,
        language=ficha.language,
        sourceType=ficha.source_type,
        licenseClass=ficha.license_class,
        studyDesign=ficha.study_design,
        trialPhase=ficha.trial_phase,
        primaryEndpoint=ficha.primary_endpoint,
        sampleSize=ficha.sample_size,
        publishedAt=ficha.published_at,
        lastUpdatedAt=ficha.last_updated_at,
        guidelineVersion=ficha.guideline_version,
        authors=ficha.authors,
        sourceUrl=ficha.source_url,
        possiblyOutdated=False,  # FR-26 (vigencia) fuera del S1
        newerVersionAvailable=False,
        chunkTextSnapshot=chunk.chunk_text,
        chunkId=chunk.chunk_id,
    )
