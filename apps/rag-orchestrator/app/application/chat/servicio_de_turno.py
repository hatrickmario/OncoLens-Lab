"""`ChatTurnService`: caso de uso de `/chat/turn` (US-259, ADR-51).

Orden: versión del catálogo (409, antes de cualquier adapter) → hilo (404 si no existe y no trae ``rehydration``, antes de
entrar al grafo) → grafo del turno → ensamblado de la respuesta con los avisos de RN-19. El estado del hilo vive solo en
memoria del proceso; los logs llevan ``traceId``, ``threadId`` e intención, jamás el texto de la pregunta, de la memoria ni
de la respuesta (RN-10, RN-11).
"""

from __future__ import annotations

import logging
from collections.abc import Mapping
from typing import Any

from app.application.catalogo_exigido import exigir_catalogo_de_la_solicitud
from app.application.chat.avisos import avisos_del_turno
from app.application.chat.capacidades.caso import NodoCaso
from app.application.chat.capacidades.evidencia import NodoEvidencia
from app.application.chat.capacidades.seguimiento_evidencia import (
    NodoSeguimientoDeEvidencia,
    ParametrosDelSeguimiento,
)
from app.application.chat.contexto_del_turno import con_evidencia_del_turno
from app.application.chat.grafo import ConfiguracionDelGrafo, EstadoDelGrafo, Nodo, construir_grafo
from app.application.chat.nodo_faltantes import crear_nodo_faltantes
from app.application.chat.registro_de_hilos import RegistroDeHilos
from app.application.chat.traduccion import (
    bloque_del_contrato,
    completitud_del_caso,
    estado_de_rehidratacion,
    consulta_de_evidencia,
    estado_estructurado_del_contrato,
    hechos_del_caso,
)
from app.application.ports import (
    CatalogoClinico,
    Clock,
    ContadorDeTokens,
    DatosCriticosDelCatalogoMontado,
    LlmClient,
    PosicionDeChunks,
    ProhibitedTermsChecker,
)
from app.application.rag_orchestrator_service import RAGOrchestratorService
from app.application.selector_proveedor_llm import con_clasificacion
from app.application.verificacion_de_soporte import VerificadorDeSoporte
from app.config.settings import Settings
from app.domain.chat.estado import (
    INTENCIONES_CLASIFICABLES,
    EstadoDelHilo,
    Intencion,
    Subintencion,
)
from app.schemas.generated.models import (
    ChatTurnRequest,
    ChatTurnResponse,
    RagQueryInternalResponse,
)

logger = logging.getLogger(__name__)


class ChatTurnService:
    def __init__(
        self,
        *,
        llm: LlmClient,
        catalogo: CatalogoClinico,
        contador: ContadorDeTokens,
        reloj: Clock,
        settings: Settings,
        terminos_por_tipo: Mapping[str, frozenset[str]],
        verificador_terminos: ProhibitedTermsChecker,
        servicio_de_evidencia: RAGOrchestratorService | None = None,
        posiciones: PosicionDeChunks | None = None,
        fuentes_documentales: DatosCriticosDelCatalogoMontado,
        soporte: VerificadorDeSoporte | None = None,
    ) -> None:
        self._catalogo = catalogo
        self._settings = settings
        self.registro = RegistroDeHilos(
            reloj=reloj,
            ttl_segundos=settings.chat_thread_ttl_seconds,
            max_hilos=settings.chat_max_threads,
        )
        configuracion = ConfiguracionDelGrafo(
            presupuesto_de_memoria=settings.chat_memory_max_tokens,
            terminos_por_tipo=terminos_por_tipo,
            limitacion_cuando_vacio={
                intencion: settings.chat_sin_datos_texto
                for intencion in INTENCIONES_CLASIFICABLES
                if intencion is not Intencion.evidencia
            },
        )
        caso = NodoCaso(
            llm=llm,
            contador=contador,
            configuracion=configuracion,
            soporte=soporte,
            max_palabras_por_afirmacion=settings.claim_max_words,
            texto_sin_datos_en_periodo=settings.chat_sin_datos_periodo_texto,
            texto_sin_fecha=settings.chat_sin_fecha_texto,
        )
        evidencia, seguimiento = _capacidades_de_evidencia(
            servicio_de_evidencia, posiciones, llm, contador, configuracion, settings
        )
        # Sin el nodo de seguimiento (sin corpus detrás) ninguna pregunta se enruta como seguimiento.
        self._con_seguimiento = bool(seguimiento)
        self._grafo = construir_grafo(
            llm=llm,
            contador=contador,
            configuracion=configuracion,
            capacidades={
                **evidencia,
                Intencion.caso: caso.ejecutar,
                Intencion.faltantes: crear_nodo_faltantes(fuentes_documentales),
            },
            subcapacidades=seguimiento,
            guardado=self.registro.guardado,
            verificador_terminos=verificador_terminos,
        )

    async def turno(self, solicitud: ChatTurnRequest) -> ChatTurnResponse:
        trace_id = solicitud.traceId.root
        exigir_catalogo_de_la_solicitud(self._catalogo, trace_id, solicitud.catalogVersion)
        hilo = solicitud.threadId
        es_nuevo = self.registro.admitir_turno(
            hilo, con_rehidratacion=solicitud.rehydration is not None
        )
        consulta = consulta_de_evidencia(solicitud, self._settings.chat_evidence_max_options)
        try:
            with (
                con_clasificacion(solicitud.dataClassification.value) as contexto,
                con_evidencia_del_turno(consulta) as evidencia,
            ):
                final = await self._grafo.ainvoke(
                    self._entrada_del_turno(solicitud, es_nuevo), self.registro.configuracion(hilo)
                )
        except Exception:
            if (
                es_nuevo
            ):  # un hilo sin su primer turno no tiene estado: que Backend 1 vuelva a rehidratarlo
                self.registro.olvidar(hilo)
            else:  # el turno fallido no deja su pregunta ni sus hechos en el hilo que sigue vivo
                self.registro.compactar(hilo)
            raise
        self.registro.compactar(hilo)
        logger.info(
            "event=chat_turno traceId=%s threadId=%s intencion=%s bloques=%d omittedClaims=%d",
            trace_id,
            hilo,
            final["intencion"].value,
            len(final["bloques"]),
            final["omitidas"],
        )
        return self._respuesta(final, contexto.proveedor_declarado.value, evidencia.resultado)

    def _entrada_del_turno(self, solicitud: ChatTurnRequest, es_nuevo: bool) -> EstadoDelGrafo:
        diagnostico = solicitud.clinicalContext.diagnosis
        entrada: EstadoDelGrafo = {
            "pregunta": solicitud.question,
            "hechos": hechos_del_caso(solicitud.caseFacts),
            "completitud": completitud_del_caso(solicitud.completeness),
            "version_del_catalogo": solicitud.catalogVersion,
            "tipo_del_contexto": diagnostico.cancerType.root if diagnostico is not None else "",
            "clasificacion_de_datos": solicitud.dataClassification.value,
            "trace_id": solicitud.traceId.root,
            # Solo si hay análisis activo: el id lo conoce únicamente Backend 1 y nunca entra al grafo (ni al prompt ni a logs).
            "hay_analisis_activo": self._con_seguimiento and solicitud.activeAnalysisId is not None,
        }
        if es_nuevo and solicitud.rehydration is not None:
            entrada["hilo"] = estado_de_rehidratacion(solicitud.rehydration)
        return entrada

    def _respuesta(
        self,
        final: dict[str, Any],
        proveedor: str,
        evidencia: RagQueryInternalResponse | None,
    ) -> ChatTurnResponse:
        intencion = final["intencion"]
        hilo: EstadoDelHilo = final["hilo"]
        subintencion = final.get("subintencion")
        return ChatTurnResponse.model_validate(
            {
                "intent": intencion.value,
                **({"subintent": subintencion.value} if subintencion is not None else {}),
                **({"evidenceAnalysis": evidencia} if evidencia is not None else {}),
                "blocks": [bloque_del_contrato(b) for b in final["bloques"]],
                "omittedClaims": final["omitidas"],
                "structuredState": estado_estructurado_del_contrato(hilo.estructurado),
                "llmProvider": proveedor,
                "notices": [
                    *(
                        avisos_del_turno(self._settings, intencion)
                        if intencion in INTENCIONES_CLASIFICABLES
                        else []
                    ),
                    *final.get("avisos", ()),
                ],
            }
        )


def _capacidades_de_evidencia(
    servicio: RAGOrchestratorService | None,
    posiciones: PosicionDeChunks | None,
    llm: LlmClient,
    contador: ContadorDeTokens,
    configuracion: ConfiguracionDelGrafo,
    settings: Settings,
) -> tuple[dict[Intencion, Nodo], dict[Subintencion, Nodo]]:
    """Los nodos reales de evidencia si hay corpus detrás; si no, rige el esqueleto de ``construir_grafo``.

    El análisis nuevo es el nodo de la intención ``evidencia``; el seguimiento del análisis activo es el de la subintención."""
    if servicio is None or posiciones is None:
        return {}, {}
    analisis = NodoEvidencia(consulta=servicio, posiciones=posiciones)
    seguimiento = NodoSeguimientoDeEvidencia(
        servicio=servicio,
        posiciones=posiciones,
        llm=llm,
        contador=contador,
        configuracion=configuracion,
        parametros=ParametrosDelSeguimiento(
            claims_min=settings.claims_min_per_option,
            claims_max=settings.claims_max_per_option,
            claim_max_words=settings.claim_max_words,
            max_chars_fragmentos=settings.llm_fragments_max_chars,
            num_ctx=settings.llm_num_ctx,
        ),
    )
    return (
        {Intencion.evidencia: analisis.ejecutar},
        {Subintencion.seguimiento_evidencia: seguimiento.ejecutar},
    )
