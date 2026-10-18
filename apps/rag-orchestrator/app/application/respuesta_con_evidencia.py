"""Ensamblado de la respuesta `con_evidencia` a partir de las citas validadas (RN-01, RN-04).

Cada cita se construye desde el catálogo y el chunk recuperado; del generador solo se conserva qué chunks citó.
L1D-275 amplía este ensamblado (recorte, aplicabilidad, síntesis) y L1D-180 inserta el soporte NLI antes de él.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import asdict, dataclass

from app.application.ports import ResultadoDeRecuperacion
from app.domain.citations import (
    FichaDeFuente,
    OpcionAceptada,
    OpcionDescartada,
    ResultadoCitas,
    construir_cita,
)
from app.domain.relevance import ChunkPuntuado, top_relevance_score
from app.schemas.generated.models import (
    ApplicabilitySummary,
    CitedSource,
    DiscardedOption,
    DiscardReason,
    EvidenceOption,
    RagQueryInternalResponse,
    RagQueryStatus,
    RetrievalStats,
    Synthesis,
)


@dataclass(frozen=True)
class ChunkCitable:
    """Un chunk recuperado en esta consulta con la ficha de su documento: lo único que puede citarse."""

    chunk: ChunkPuntuado
    ficha: FichaDeFuente


def ensamblar_respuesta_con_evidencia(
    resultado: ResultadoCitas,
    citables: Mapping[str, ChunkCitable],
    recuperacion: ResultadoDeRecuperacion,
) -> RagQueryInternalResponse:
    return RagQueryInternalResponse(
        status=RagQueryStatus.con_evidencia,
        synthesis=Synthesis(agreements=[], discrepancies=[]),
        applicability=[],
        evidenceOptions=[_opcion_con_evidencia(a, citables) for a in resultado.aceptadas],
        discardedOptions=[_opcion_descartada(d) for d in resultado.descartadas],
        limitations=[],
        assumptions=[],
        retrievalStats=RetrievalStats(
            retrieved=recuperacion.recuperados,
            aboveThreshold=len(recuperacion.chunks_sobre_umbral),
        ),
        omittedClaims=0,
        agentSteps=[],
        topRelevanceScore=top_relevance_score(recuperacion.chunks_sobre_umbral),
        meta=recuperacion.meta,
    )


def _opcion_con_evidencia(
    aceptada: OpcionAceptada, citables: Mapping[str, ChunkCitable]
) -> EvidenceOption:
    """``relevanceScore`` = el del chunk citado más relevante: metadato secundario, no mide la opción (RN-03)."""
    citados = [citables[chunk_id] for chunk_id in aceptada.chunk_ids_validos]
    return EvidenceOption(
        option=aceptada.opcion.option,
        rationale=aceptada.opcion.rationale,
        applicabilitySummary=ApplicabilitySummary(
            coincide=0, parcial=0, noCoincide=0, desconocido=0
        ),
        populationNotComparable=False,
        perSource=[],
        relevanceScore=max(c.chunk.relevance_score for c in citados),
        warnings=[],
        citedSources=[CitedSource.model_validate(asdict(_cita_de(c))) for c in citados],
    )


def _cita_de(citable: ChunkCitable):
    return construir_cita(citable.chunk, citable.ficha)


def _opcion_descartada(descartada: OpcionDescartada) -> DiscardedOption:
    """``unsupportedClaims`` queda vacío: una opción descartada por citas no llegó a evaluarse con NLI."""
    return DiscardedOption(
        option=descartada.opcion.option,
        rationale=descartada.opcion.rationale,
        discardReason=DiscardReason(descartada.motivo.value),
        unsupportedClaims=[],
    )
