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
from app.domain.aplicabilidad_tipos import CriterioEvaluado, ResumenDeEstados, ValorDePoblacion
from app.domain.applicability_aggregation import (
    FuenteDeLaOpcion,
    agregar_aplicabilidad_de_opcion,
)
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
    PartialReason,
    PatientDataWarning,
    PerSourceItem,
    RagQueryInternalResponse,
    RagQueryStatus,
    RetrievalStats,
    Scope,
    SourceApplicability,
    StudyPopulationValue,
    Synthesis,
    UnknownReason,
    Warning,
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
        summary=_resumen_del_contrato(resumen),
        populationNotComparable=fuente.poblacion_no_comparable,
    )


def _resumen_del_contrato(resumen: ResumenDeEstados) -> ApplicabilitySummary:
    return ApplicabilitySummary(
        coincide=resumen.coincide,
        parcial=resumen.parcial,
        noCoincide=resumen.no_coincide,
        desconocido=resumen.desconocido,
    )


LONGITUD_MAXIMA_DEL_VALOR_DE_POBLACION = 200
"""``StudyPopulationValue.value`` (contrato): un valor más largo no cabe en la respuesta; el lector de US-241 aún no lo
valida (P6 abierta), así que aquí no se emite en lugar de tumbar el análisis."""


def _criterio_aplicable(
    criterio: CriterioEvaluado, mejor_chunk: ChunkCitable, citables: Mapping[str, ChunkCitable]
) -> ApplicabilityCriterion:
    """Todo criterio que muestra un valor del estudio cita la fuente, aunque sea ``desconocido`` (RN-25, design D6);
    sin valor del estudio no hay nada que citar. Un valor textual aceptado cita el chunk que lo respaldó (US-123); uno de
    la lista, los fragmentos de los que salen sus valores (ADR-47); uno estructurado antiguo, el mejor chunk de la fuente.
    ``patientDataWarning`` es el aviso del dato del paciente (US-124)."""
    return ApplicabilityCriterion(
        criterion=criterio.clave,
        patientValue=criterio.valor_paciente,
        studyPopulationValue=criterio.valor_estudio,
        **_poblacion_en_lista(criterio),
        status=ApplicabilityStatus(criterio.estado),
        unknownReason=UnknownReason(criterio.causa) if criterio.causa else None,
        isExclusionary=criterio.es_excluyente,
        patientDataWarning=PatientDataWarning(criterio.aviso) if criterio.aviso else None,
        citedSources=[
            _cita_de(c) for c in _fragmentos_que_respaldan(criterio, mejor_chunk, citables)
        ],
    )


def _poblacion_en_lista(criterio: CriterioEvaluado) -> dict[str, object]:
    """``studyPopulationValues`` y ``partialReason``: opcionales, solo con la forma de lista y un motivo parcial."""
    campos: dict[str, object] = {}
    valores = [
        v
        for v in criterio.valores_del_estudio
        if len(v.valor) <= LONGITUD_MAXIMA_DEL_VALOR_DE_POBLACION
    ]
    if valores:
        campos["studyPopulationValues"] = [_valor_del_contrato(v) for v in valores]
    if criterio.motivo_parcial:
        campos["partialReason"] = PartialReason(criterio.motivo_parcial)
    return campos


def _valor_del_contrato(valor: ValorDePoblacion) -> StudyPopulationValue:
    return StudyPopulationValue(
        value=valor.valor, chunkId=valor.chunk_id or "", scope=Scope(valor.alcance)
    )


def _fragmentos_que_respaldan(
    criterio: CriterioEvaluado, mejor_chunk: ChunkCitable, citables: Mapping[str, ChunkCitable]
) -> list[ChunkCitable]:
    if criterio.valores_del_estudio:
        ids = dict.fromkeys(v.chunk_id for v in criterio.valores_del_estudio)
        return [citables[i] for i in ids if i in citables]
    if criterio.valor_estudio is None:
        return []
    return [citables[criterio.chunk_citado_id] if criterio.chunk_citado_id else mejor_chunk]


def _cita_de(citable: ChunkCitable) -> CitedSource:
    return CitedSource.model_validate(asdict(construir_cita(citable.chunk, citable.ficha)))


def _opcion_con_evidencia(
    validada: OpcionConRelevancia, citables: Mapping[str, ChunkCitable]
) -> EvidenceOption:
    """``relevanceScore`` = el del chunk citado más relevante: metadato secundario, no mide la opción (RN-03)."""
    aceptada = validada.aceptada
    aplicabilidad = validada.aplicabilidad or agregar_aplicabilidad_de_opcion([])
    citados = [citables[chunk_id] for chunk_id in aceptada.chunk_ids_validos]
    return EvidenceOption(
        option=aceptada.opcion.option,
        rationale=aceptada.opcion.rationale,
        **({"details": list(aceptada.opcion.details)} if aceptada.opcion.details else {}),
        applicabilitySummary=_resumen_del_contrato(aplicabilidad.resumen),
        populationNotComparable=aplicabilidad.poblacion_no_comparable,
        perSource=[_aplicabilidad_de_fuente_citada(f) for f in aplicabilidad.por_fuente],
        relevanceScore=validada.relevance_score,
        warnings=[Warning(aviso) for aviso in aplicabilidad.avisos],
        citedSources=[_cita_de(c) for c in citados],
    )


def _aplicabilidad_de_fuente_citada(fuente: FuenteDeLaOpcion) -> PerSourceItem:
    return PerSourceItem(
        externalId=fuente.external_id,
        summary=_resumen_del_contrato(fuente.resumen),
        populationNotComparable=fuente.poblacion_no_comparable,
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
