"""Traducción entre el contrato de `/chat/turn` y los datos del dominio del chat (US-259): sin reglas, solo mapeo."""

from __future__ import annotations

from typing import Any

from app.domain.chat.estado import (
    EstadoDelHilo,
    EstadoEstructurado,
    Intencion,
    TurnoPrevio,
    UltimaEvidencia,
)
from app.domain.chat.turno import BloqueDelTurno, CitaDelBloque, HechoDelCaso
from app.schemas.generated.models import (
    CaseFact,
    ChatRehydration,
    ChatTurnRequest,
    RagFiltersApplied,
    RagQueryInternalRequest,
    SourcesSelected,
    StructuredState,
)


def hechos_del_caso(hechos: list[CaseFact]) -> tuple[HechoDelCaso, ...]:
    return tuple(
        HechoDelCaso(
            ref=h.factRef.root,
            verbalizacion=h.verbalization.root,
            dia_relativo=h.relativeDay,
            estado_de_revision=h.reviewStatus.value,
            conflicto_con=h.conflictWith.root if h.conflictWith else None,
        )
        for h in hechos
    )


def estado_de_rehidratacion(rehidratacion: ChatRehydration) -> EstadoDelHilo:
    turnos = tuple(
        TurnoPrevio(
            pregunta=t.question.root,
            intencion=t.intent.value,
            textos_de_bloques=tuple(b.root for b in t.blocksText),
            fact_refs=tuple(r.root for r in t.factRefs),
        )
        for t in rehidratacion.turns
    )
    return EstadoDelHilo(
        turnos=turnos, estructurado=_estructurado_del_contrato(rehidratacion.structuredState)
    )


def _estructurado_del_contrato(estado: StructuredState) -> EstadoEstructurado:
    evidencia = estado.ultimaEvidencia
    return EstadoEstructurado(
        intents_vistos=tuple(i.value for i in estado.intentsVistos),
        preguntas_previas=tuple(p.root for p in estado.preguntasPrevias),
        opciones_mostradas=tuple(estado.opcionesMostradas),
        citas_mostradas=tuple(estado.citasMostradas),
        faltantes_senalados=tuple(estado.faltantesSenalados),
        ultima_evidencia=None
        if evidencia is None
        else UltimaEvidencia(
            query=evidencia.query.root,
            chunk_ids=tuple(evidencia.chunkIds),
            top_relevance_score=evidencia.topRelevanceScore,
        ),
    )


def estado_estructurado_del_contrato(estado: EstadoEstructurado) -> dict[str, Any]:
    cuerpo: dict[str, Any] = {
        "intentsVistos": [Intencion(i).value for i in estado.intents_vistos],
        "preguntasPrevias": list(estado.preguntas_previas),
        "opcionesMostradas": list(estado.opciones_mostradas),
        "citasMostradas": list(estado.citas_mostradas),
        "faltantesSenalados": list(estado.faltantes_senalados),
    }
    if estado.ultima_evidencia is not None:
        cuerpo["ultimaEvidencia"] = {
            "query": estado.ultima_evidencia.query,
            "chunkIds": list(estado.ultima_evidencia.chunk_ids),
            "topRelevanceScore": estado.ultima_evidencia.top_relevance_score,
        }
    return cuerpo


def bloque_del_contrato(bloque: BloqueDelTurno) -> dict[str, Any]:
    cuerpo: dict[str, Any] = {"kind": bloque.tipo.value, "text": bloque.texto}
    if bloque.fact_refs:
        cuerpo["factRefs"] = list(bloque.fact_refs)
    if bloque.citas:
        cuerpo["citations"] = [_cita_del_contrato(c) for c in bloque.citas]
    return cuerpo


def _cita_del_contrato(cita: CitaDelBloque) -> dict[str, Any]:
    return {
        "chunkId": cita.chunk_id,
        "documentId": cita.document_id,
        "sourceTitle": cita.titulo_de_la_fuente,
        "chunkOrdinal": cita.ordinal,
        "chunkCount": cita.cantidad,
        "chunkTextSnapshot": cita.texto_del_chunk,
    }


def consulta_de_evidencia(solicitud: ChatTurnRequest, max_options: int) -> RagQueryInternalRequest:
    """La petición de ``/rag/query`` equivalente al turno de evidencia: misma pregunta enmascarada, contexto desidentificado
    y clasificación de datos. El chat no tiene filtros ni fuentes elegidas: todas las fuentes y sin filtro de antigüedad
    (``publishedFromYear = null``, toda la evidencia del corpus vigente)."""
    return RagQueryInternalRequest(
        traceId=solicitud.traceId,
        query=solicitud.question,
        sourcesSelected=SourcesSelected(guias=True, ensayos=True, publicaciones=True),
        dataClassification=solicitud.dataClassification,
        catalogVersion=solicitud.catalogVersion,
        maxOptions=max_options,
        filtersApplied=RagFiltersApplied(
            historiaCompleta=False,
            soloBiomarcadoresRelevantes=False,
            ultimosSeisMeses=False,
            antecedentesFamiliares=False,
            publishedFromYear=None,
        ),
        clinicalContext=solicitud.clinicalContext,
    )
