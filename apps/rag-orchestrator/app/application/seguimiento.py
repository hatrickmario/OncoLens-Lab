"""`ResponderSeguimiento`: caso de uso de `/rag/follow-up` sobre el pipeline del análisis (US-218, design D6).

Orden: clasificar pertinencia (determinista, sin adapters) → recuperar → umbral (RN-02: sin chunks, ``sin_evidencia`` sin
invocar al LLM ni a la reescritura) → generar con el prompt de seguimiento → validar citas, soporte NLI y lenguaje
(RN-01, RN-23, RN-24) → ensamblar. Sin estado: nada se escribe en disco, caché, Milvus ni `corpus`; los logs llevan solo
``traceId`` y conteos, nunca la pregunta, la memoria ni el contexto (RN-10, RN-11).
"""

from __future__ import annotations

import logging
from collections.abc import Mapping, Sequence
from dataclasses import dataclass

from app.application.chunk_citable import ChunkCitable
from app.application.ports import (
    ResultadoDeRecuperacion,
    SeguimientoGenerado,
    SeguimientoGenerator,
)
from app.application.rag_orchestrator_service import RAGOrchestratorService
from app.application.respuesta_con_evidencia import cita_del_contrato
from app.application.selector_proveedor_llm import con_clasificacion
from app.domain.atribucion import componer_con_marco
from app.domain.citations import OpcionAceptada, OpcionGenerada, validar_citas
from app.domain.claims import AfirmacionAtomica
from app.domain.contexto_del_seguimiento import (
    ContextoDelSeguimiento,
    clasificar_contexto_del_seguimiento,
)
from app.domain.relevance import top_relevance_score
from app.prompts.seguimiento import VERSION_DEL_PROMPT_DE_SEGUIMIENTO
from app.schemas.generated.models import (
    CitedSource,
    RagFollowUpRequest,
    RagFollowUpResponse,
    RagFollowUpStatus,
    RagMeta,
    RagQueryInternalRequest,
    SourcesSelected,
    SupportedClaim,
    SupportedClaim1,
)

logger = logging.getLogger(__name__)

TITULO_DE_LA_RESPUESTA = "Respuesta de seguimiento"
"""Título neutro con el que cada afirmación viaja por la validación de opciones; nunca se muestra."""


def consulta_equivalente(solicitud: RagFollowUpRequest) -> RagQueryInternalRequest:
    """La consulta de recuperación que equivale al seguimiento: misma pregunta, contexto y filtros (``maxOptions`` y
    ``sourcesSelected`` no rigen en el seguimiento: no devuelve opciones y no filtra por tipo de fuente)."""
    return RagQueryInternalRequest(
        traceId=solicitud.traceId,
        query=solicitud.question,
        sourcesSelected=SourcesSelected(guias=True, ensayos=True, publicaciones=True),
        dataClassification=solicitud.dataClassification,
        catalogVersion=solicitud.catalogVersion,
        maxOptions=1,
        filtersApplied=solicitud.filtersApplied,
        clinicalContext=solicitud.clinicalContext,
    )


class ResponderSeguimiento:
    def __init__(
        self,
        *,
        servicio: RAGOrchestratorService,
        generador: SeguimientoGenerator,
        terminos_por_tipo: Mapping[str, frozenset[str]],
    ) -> None:
        self._servicio = servicio
        self._generador = generador
        self._terminos_por_tipo = terminos_por_tipo

    async def responder(self, solicitud: RagFollowUpRequest) -> RagFollowUpResponse:
        with con_clasificacion(solicitud.dataClassification.value) as contexto:
            respuesta = await self._responder_con_proveedor_acotado(solicitud)
        return respuesta.model_copy(update={"meta": contexto.declarar_en(respuesta.meta)})

    async def _responder_con_proveedor_acotado(
        self, solicitud: RagFollowUpRequest
    ) -> RagFollowUpResponse:
        consulta = consulta_equivalente(solicitud)
        if self._es_ajena_al_analisis(solicitud):
            meta = await self._servicio.meta_sin_recuperacion(
                consulta, VERSION_DEL_PROMPT_DE_SEGUIMIENTO
            )
            return _respuesta_sin_afirmaciones(RagFollowUpStatus.fuera_de_contexto, meta)
        recuperacion = await self._servicio.recuperar(
            consulta, con_reescritura=False, version_del_prompt=VERSION_DEL_PROMPT_DE_SEGUIMIENTO
        )
        if not recuperacion.chunks_sobre_umbral:
            return _respuesta_sin_afirmaciones(RagFollowUpStatus.sin_evidencia, recuperacion.meta)
        generado = await self._generador.generar(solicitud, recuperacion)
        if generado.fuera_de_contexto:
            return _respuesta_sin_afirmaciones(
                RagFollowUpStatus.fuera_de_contexto, recuperacion.meta
            )
        return await self._validar_y_ensamblar(solicitud, generado, recuperacion)

    def _es_ajena_al_analisis(self, solicitud: RagFollowUpRequest) -> bool:
        diagnostico = solicitud.clinicalContext.diagnosis
        tipo = diagnostico.cancerType.root if diagnostico is not None else ""
        return (
            clasificar_contexto_del_seguimiento(solicitud.question, tipo, self._terminos_por_tipo)
            is ContextoDelSeguimiento.fuera_de_contexto
        )

    async def _validar_y_ensamblar(
        self,
        solicitud: RagFollowUpRequest,
        generado: SeguimientoGenerado,
        recuperacion: ResultadoDeRecuperacion,
    ) -> RagFollowUpResponse:
        """RN-01, RN-04, RN-23, RN-24: solo se muestra lo que cita un chunk de ESTE turno, lo implica el NLI frente a
        esos chunks y respeta el lenguaje; el resto se omite y suma en ``omittedClaims``."""
        trace_id = solicitud.traceId.root
        validadas = await validar_afirmaciones_citadas(
            self._servicio, trace_id, recuperacion, generado.afirmaciones
        )
        omitidas = validadas.omitidas
        respuesta = _ensamblar(validadas.soportadas, validadas.citables, recuperacion, omitidas)
        logger.info(
            "event=rag_follow_up_validacion traceId=%s afirmaciones=%d mostradas=%d omittedClaims=%d",
            trace_id,
            len(generado.afirmaciones),
            len(respuesta.answer),
            omitidas,
        )
        return respuesta


@dataclass(frozen=True)
class AfirmacionesValidadas:
    """Lo que sobrevive a la validación de un seguimiento: las afirmaciones con soporte, los chunks citables del turno y
    cuántas se omitieron (sin cita del turno, cita inválida, NLI sin ``entailment`` o lenguaje prohibido)."""

    soportadas: tuple[OpcionAceptada, ...]
    citables: Mapping[str, ChunkCitable]
    omitidas: int


async def validar_afirmaciones_citadas(
    servicio: RAGOrchestratorService,
    trace_id: str,
    recuperacion: ResultadoDeRecuperacion,
    afirmaciones: Sequence[AfirmacionAtomica],
) -> AfirmacionesValidadas:
    """RN-01, RN-04, RN-23, RN-24: chunks citables → citas del turno → soporte NLI y lenguaje. Una sola regla para
    ``/rag/follow-up`` y para el seguimiento del chat: las mismas afirmaciones dan el mismo ``omittedClaims``."""
    idioma = recuperacion.meta.responseLanguage.value
    citables = await servicio.chunks_citables(trace_id, recuperacion)
    citas = validar_citas(tuple(como_opcion(a, idioma) for a in afirmaciones), citables.keys())
    soporte = await servicio.verificador_de_soporte.verificar(
        trace_id,
        idioma,
        citas.aceptadas,
        (),
        {i: c.chunk.chunk_text for i, c in citables.items()},
        {i: c.ficha.title for i, c in citables.items()},
    )
    omitidas = len(citas.descartadas) + len(soporte.descartadas) + soporte.omitidas
    return AfirmacionesValidadas(soporte.soportadas, citables, omitidas)


def como_opcion(afirmacion: AfirmacionAtomica, idioma: str) -> OpcionGenerada:
    """La afirmación como una opción de una sola afirmación principal: así reutiliza, sin copiarlas, la validación de
    citas, el soporte NLI y el verificador de lenguaje del análisis. La atribución la compone el código (ADR-34)."""
    composicion = componer_con_marco((afirmacion,), idioma)
    return OpcionGenerada(
        TITULO_DE_LA_RESPUESTA,
        composicion.rationale,
        afirmacion.chunk_ids,
        (),
        (afirmacion,),
    )


def _ensamblar(
    soportadas: tuple[OpcionAceptada, ...],
    citables: Mapping[str, ChunkCitable],
    recuperacion: ResultadoDeRecuperacion,
    omitidas: int,
) -> RagFollowUpResponse:
    respuesta = [
        SupportedClaim(
            SupportedClaim1(
                text=a.opcion.rationale,
                citedSources=[cita_del_contrato(citables[i]) for i in a.chunk_ids_validos],
                patientDataRefs=[],
            )
        )
        for a in soportadas
    ]
    if not respuesta:
        return _respuesta_sin_afirmaciones(
            RagFollowUpStatus.sin_evidencia, recuperacion.meta, omitidas
        )
    citadas: dict[str, CitedSource] = {}
    for afirmacion in respuesta:
        for cita in afirmacion.root.citedSources:
            citadas.setdefault(cita.chunkId, cita)
    return RagFollowUpResponse(
        status=RagFollowUpStatus.con_evidencia,
        answer=respuesta,
        citedSources=list(citadas.values()),
        omittedClaims=omitidas,
        topRelevanceScore=top_relevance_score(recuperacion.chunks_sobre_umbral),
        meta=recuperacion.meta,
    )


def _respuesta_sin_afirmaciones(
    estado: RagFollowUpStatus, meta: RagMeta, omitidas: int = 0
) -> RagFollowUpResponse:
    """``sin_evidencia`` (RN-02) o ``fuera_de_contexto``: ``answer`` y ``citedSources`` vacíos y ``topRelevanceScore =
    null`` (``null`` ≠ ``0.0``)."""
    return RagFollowUpResponse(
        status=estado,
        answer=[],
        citedSources=[],
        omittedClaims=omitidas,
        topRelevanceScore=None,
        meta=meta,
    )
