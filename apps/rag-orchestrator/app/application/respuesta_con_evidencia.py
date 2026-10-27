"""Ensamblado de la respuesta `con_evidencia` a partir de las citas validadas (RN-01, RN-04).

Cada cita se construye desde el catálogo y el chunk recuperado; del generador solo se conserva qué chunks citó.
Recibe las opciones soportadas (NLI y lenguaje, L1D-180) y recortadas a ``maxOptions`` (L1D-275), más las descartadas
por citas y por soporte, las limitaciones verificadas y ``omittedClaims``.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import asdict

from app.application.aplicabilidad import AplicabilidadDeFuente
from app.application.chunk_citable import ChunkCitable
from app.application.ports import ResultadoDeRecuperacion
from app.domain.aplicabilidad_tipos import CriterioEvaluado
from app.domain.citations import OpcionDescartada, construir_cita
from app.domain.option_selection import OpcionConRelevancia
from app.domain.relevance import top_relevance_score
from app.domain.support import OpcionSinSoporte
from app.schemas.generated.models import (
    ApplicabilityCriterion,
    ApplicabilityStatus,
    ApplicabilitySummary,
    CitedSource,
    DiscardedOption,
    DiscardReason,
    EvidenceOption,
    Limitation,
    Origin,
    PatientDataWarning,
    RagQueryInternalResponse,
    RagQueryStatus,
    RetrievalStats,
    SourceApplicability,
    Synthesis,
    UnknownReason,
)


def ensamblar_respuesta_con_evidencia(
    opciones: Sequence[OpcionConRelevancia],
    descartadas: Sequence[OpcionDescartada],
    sin_soporte: Sequence[OpcionSinSoporte],
    limitaciones: Sequence[str],
    omitidas: int,
    citables: Mapping[str, ChunkCitable],
    recuperacion: ResultadoDeRecuperacion,
    aplicabilidad: Sequence[AplicabilidadDeFuente],
) -> RagQueryInternalResponse:
    return RagQueryInternalResponse(
        status=RagQueryStatus.con_evidencia,
        synthesis=Synthesis(agreements=[], discrepancies=[]),
        applicability=[_fuente_con_aplicabilidad(f, citables) for f in aplicabilidad],
        evidenceOptions=[_opcion_con_evidencia(o, citables) for o in opciones],
        discardedOptions=[
            *(_opcion_descartada(d) for d in descartadas),
            *(_opcion_sin_soporte(d) for d in sin_soporte),
        ],
        limitations=[Limitation(text=t, origin=Origin.llm_verificado) for t in limitaciones],
        assumptions=[],
        retrievalStats=RetrievalStats(
            retrieved=recuperacion.recuperados,
            aboveThreshold=len(recuperacion.chunks_sobre_umbral),
        ),
        omittedClaims=omitidas,
        agentSteps=[],
        topRelevanceScore=top_relevance_score(recuperacion.chunks_sobre_umbral),
        meta=recuperacion.meta,
    )


def _fuente_con_aplicabilidad(
    fuente: AplicabilidadDeFuente, citables: Mapping[str, ChunkCitable]
) -> SourceApplicability:
    """``SourceApplicability`` de un documento: los valores se copian tal cual, sin puntaje ni ponderación (RN-28)."""
    resumen = fuente.resumen
    return SourceApplicability(
        externalId=fuente.external_id,
        criteria=[_criterio_aplicable(c, fuente.mejor_chunk, citables) for c in fuente.criterios],
        summary=ApplicabilitySummary(
            coincide=resumen.coincide,
            parcial=resumen.parcial,
            noCoincide=resumen.no_coincide,
            desconocido=resumen.desconocido,
        ),
        populationNotComparable=fuente.poblacion_no_comparable,
    )


def _criterio_aplicable(
    criterio: CriterioEvaluado, mejor_chunk: ChunkCitable, citables: Mapping[str, ChunkCitable]
) -> ApplicabilityCriterion:
    """Todo criterio que muestra un valor del estudio cita la fuente, aunque sea ``desconocido`` (RN-25, design D6);
    sin valor del estudio no hay nada que citar. Un valor textual aceptado cita el chunk que lo respaldó (US-123);
    uno estructurado, el mejor chunk de la fuente. ``patientDataWarning`` es el aviso del dato del paciente (US-124)."""
    cita_la_fuente = criterio.valor_estudio is not None
    citado = citables[criterio.chunk_citado_id] if criterio.chunk_citado_id else mejor_chunk
    return ApplicabilityCriterion(
        criterion=criterio.clave,
        patientValue=criterio.valor_paciente,
        studyPopulationValue=criterio.valor_estudio,
        status=ApplicabilityStatus(criterio.estado),
        unknownReason=UnknownReason(criterio.causa) if criterio.causa else None,
        isExclusionary=criterio.es_excluyente,
        patientDataWarning=PatientDataWarning(criterio.aviso) if criterio.aviso else None,
        citedSources=[_cita_de(citado)] if cita_la_fuente else [],
    )


def _cita_de(citable: ChunkCitable) -> CitedSource:
    return CitedSource.model_validate(asdict(construir_cita(citable.chunk, citable.ficha)))


def _opcion_con_evidencia(
    validada: OpcionConRelevancia, citables: Mapping[str, ChunkCitable]
) -> EvidenceOption:
    """``relevanceScore`` = el del chunk citado más relevante: metadato secundario, no mide la opción (RN-03)."""
    aceptada = validada.aceptada
    citados = [citables[chunk_id] for chunk_id in aceptada.chunk_ids_validos]
    return EvidenceOption(
        option=aceptada.opcion.option,
        rationale=aceptada.opcion.rationale,
        **({"details": list(aceptada.opcion.details)} if aceptada.opcion.details else {}),
        applicabilitySummary=ApplicabilitySummary(
            coincide=0, parcial=0, noCoincide=0, desconocido=0
        ),
        populationNotComparable=False,
        perSource=[],
        relevanceScore=validada.relevance_score,
        warnings=[],
        citedSources=[_cita_de(c) for c in citados],
    )


def _opcion_descartada(descartada: OpcionDescartada) -> DiscardedOption:
    """``unsupportedClaims`` queda vacío: una opción descartada por citas no llegó a evaluarse con NLI."""
    return DiscardedOption(
        option=descartada.opcion.option,
        rationale=descartada.opcion.rationale,
        discardReason=DiscardReason(descartada.motivo.value),
        unsupportedClaims=[],
    )


def _opcion_sin_soporte(descartada: OpcionSinSoporte) -> DiscardedOption:
    """Descartada por RN-01: la afirmación sin soporte (o su literal de retiro, RN-23) figura en ``unsupportedClaims``."""
    return DiscardedOption(
        option=descartada.opcion.option,
        rationale=descartada.opcion.rationale,
        discardReason=DiscardReason.afirmacion_sin_soporte,
        unsupportedClaims=list(descartada.afirmaciones_sin_soporte),
    )
