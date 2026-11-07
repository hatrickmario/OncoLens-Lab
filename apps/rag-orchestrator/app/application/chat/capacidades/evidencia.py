"""Nodo ``evidencia`` del grafo del chat (US-265, ADR-51): el análisis de evidencia dentro de la conversación.

Sustituye el esqueleto de la intención ``evidencia`` (se inyecta en ``construir_grafo(capacidades=...)``). Reutiliza el caso
de uso de ``/rag/query`` (``ConsultaDeEvidencia``): una sola fuente de las reglas RN-01 (citas y NLI), RN-02 (sin evidencia
sin invocar al LLM), RN-04, RN-23 y RN-28 (orden por aplicabilidad). Etapas, una por método: consultar → armar los bloques
→ resumir lo recuperado. El resultado completo (``EvidenceAnalysis``) viaja en ``EvidenciaDelTurno``, no en el estado del
hilo. Logs: solo conteos y ``traceId``, jamás el texto de una opción ni de un fragmento (RN-10).
"""

from __future__ import annotations

import logging
from collections.abc import Sequence
from typing import Any

from app.application.chat.bloques_de_la_respuesta import (
    armar_bloques_de_evidencia,
    criterios_de_las_opciones,
    fuentes_citadas_por_las_opciones,
)
from app.application.chat.citas import ConstructorDeCitas
from app.application.chat.contexto_del_turno import evidencia_del_turno
from app.application.chat.grafo import EstadoDelGrafo
from app.application.ports import ConsultaDeEvidencia, PosicionDeChunks
from app.domain.chat.ampliacion_de_busqueda import aviso_de_busqueda_ampliada
from app.domain.chat.fuentes_limitaciones import limitaciones_del_analisis
from app.domain.chat.turno import BloqueDelTurno
from app.domain.chat.ultima_evidencia import resumir_ultima_evidencia
from app.schemas.generated.models import RagQueryInternalResponse

logger = logging.getLogger(__name__)


class NodoEvidencia:
    def __init__(
        self,
        *,
        consulta: ConsultaDeEvidencia,
        posiciones: PosicionDeChunks,
        aviso_de_ampliacion: str,
    ) -> None:
        self._consulta = consulta
        self._citas = ConstructorDeCitas(posiciones)
        self._aviso_de_ampliacion = aviso_de_ampliacion

    async def ejecutar(self, estado: EstadoDelGrafo) -> dict[str, Any]:
        turno = evidencia_del_turno()
        consultada = await self._consulta.consultar_con_detalle(turno.consulta)
        respuesta = consultada.respuesta
        turno.resultado = respuesta
        bloques = await self._bloques_del(
            estado["trace_id"], respuesta, consultada.chunk_ids_evaluados
        )
        logger.info(
            "event=chat_evidencia traceId=%s status=%s opciones=%d descartadas=%d bloques=%d",
            estado["trace_id"],
            respuesta.status.value,
            len(respuesta.evidenceOptions),
            len(respuesta.discardedOptions),
            len(bloques),
        )
        return {
            **self._aviso_de_la_ampliacion(respuesta),
            "propuestas": (),
            "bloques_del_nodo": bloques,
            "omitidas_del_nodo": respuesta.omittedClaims,
            "evidencia_consultada": True,
            "opciones_mostradas": tuple(o.option for o in respuesta.evidenceOptions),
            "ultima_evidencia": resumir_ultima_evidencia(
                estado["pregunta"], consultada.chunk_ids_evaluados, respuesta.topRelevanceScore
            ),
            "limitaciones_del_analisis": limitaciones_del_analisis(
                criterios_de_las_opciones(respuesta),
                len(respuesta.discardedOptions),
                bool(respuesta.evidenceOptions),
            ),
        }

    def _aviso_de_la_ampliacion(self, respuesta: RagQueryInternalResponse) -> dict[str, Any]:
        """El aviso determinista de ``notices[]`` si el turno usó el loop contextual (ADR-52): campos, nunca valores."""
        expansion = respuesta.meta.retrievalParams.contextExpansion
        if expansion is None:
            return {}
        campos = tuple(campo.value for campo in expansion.fields)
        return {"avisos_del_nodo": (aviso_de_busqueda_ampliada(self._aviso_de_ampliacion, campos),)}

    async def _bloques_del(
        self,
        trace_id: str,
        respuesta: RagQueryInternalResponse,
        chunk_ids_evaluados: Sequence[str],
    ) -> tuple[BloqueDelTurno, ...]:
        """Las citas del corpus y los bloques del análisis (la regla es la misma que usa el modo falso del chat)."""
        citas = await self._citas.construir(trace_id, fuentes_citadas_por_las_opciones(respuesta))
        return armar_bloques_de_evidencia(respuesta, citas, len(chunk_ids_evaluados))
