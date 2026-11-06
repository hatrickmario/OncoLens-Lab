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
from app.application.chat.grafo import ConfiguracionDelGrafo, EstadoDelGrafo, construir_grafo
from app.application.chat.nodo_faltantes import crear_nodo_faltantes
from app.application.chat.registro_de_hilos import RegistroDeHilos
from app.application.chat.traduccion import (
    bloque_del_contrato,
    completitud_del_caso,
    estado_de_rehidratacion,
    estado_estructurado_del_contrato,
    hechos_del_caso,
)
from app.application.selector_proveedor_llm import con_clasificacion
from app.application.ports import (
    CatalogoClinico,
    Clock,
    ContadorDeTokens,
    FuentesDeDatosCriticos,
    LlmClient,
    ProhibitedTermsChecker,
)
from app.config.settings import Settings
from app.domain.chat.estado import INTENCIONES_CLASIFICABLES, EstadoDelHilo, Intencion
from app.schemas.generated.models import ChatTurnRequest, ChatTurnResponse

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
        fuentes_documentales: FuentesDeDatosCriticos,
    ) -> None:
        self._catalogo = catalogo
        self._settings = settings
        self.registro = RegistroDeHilos(
            reloj=reloj,
            ttl_segundos=settings.chat_thread_ttl_seconds,
            max_hilos=settings.chat_max_threads,
        )
        self._grafo = construir_grafo(
            llm=llm,
            contador=contador,
            configuracion=ConfiguracionDelGrafo(
                presupuesto_de_memoria=settings.chat_memory_max_tokens,
                terminos_por_tipo=terminos_por_tipo,
            ),
            guardado=self.registro.guardado,
            verificador_terminos=verificador_terminos,
            capacidades={Intencion.faltantes: crear_nodo_faltantes(fuentes_documentales)},
        )

    async def turno(self, solicitud: ChatTurnRequest) -> ChatTurnResponse:
        trace_id = solicitud.traceId.root
        exigir_catalogo_de_la_solicitud(self._catalogo, trace_id, solicitud.catalogVersion)
        hilo = solicitud.threadId
        es_nuevo = self.registro.admitir_turno(
            hilo, con_rehidratacion=solicitud.rehydration is not None
        )
        try:
            with con_clasificacion(solicitud.dataClassification.value) as contexto:
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
        return self._respuesta(final, contexto.proveedor_declarado.value)

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
        }
        if es_nuevo and solicitud.rehydration is not None:
            entrada["hilo"] = estado_de_rehidratacion(solicitud.rehydration)
        return entrada

    def _respuesta(self, final: dict[str, Any], proveedor: str) -> ChatTurnResponse:
        intencion = final["intencion"]
        hilo: EstadoDelHilo = final["hilo"]
        return ChatTurnResponse.model_validate(
            {
                "intent": intencion.value,
                "blocks": [bloque_del_contrato(b) for b in final["bloques"]],
                "omittedClaims": final["omitidas"],
                "structuredState": estado_estructurado_del_contrato(hilo.estructurado),
                "llmProvider": proveedor,
                "notices": avisos_del_turno(self._settings)
                if intencion in INTENCIONES_CLASIFICABLES
                else [],
            }
        )
