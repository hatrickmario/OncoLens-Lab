"""Nodo ``evidencia`` del grafo del chat (US-265, ADR-51): el análisis de evidencia dentro de la conversación.

Sustituye el esqueleto de la intención ``evidencia`` (se inyecta en ``construir_grafo(capacidades=...)``). Reutiliza el caso
de uso de ``/rag/query`` (``ConsultaDeEvidencia``): una sola fuente de las reglas RN-01 (citas y NLI), RN-02 (sin evidencia
sin invocar al LLM), RN-04, RN-23 y RN-28 (orden por aplicabilidad). Etapas, una por método: consultar → armar los bloques
→ resumir lo recuperado. El resultado completo (``EvidenceAnalysis``) viaja en ``EvidenciaDelTurno``, no en el estado del
hilo. Logs: solo conteos y ``traceId``, jamás el texto de una opción ni de un fragmento (RN-10).
"""

from __future__ import annotations

import logging
from typing import Any

from app.application.chat.citas import ConstructorDeCitas, FuenteDeCita
from app.application.chat.contexto_del_turno import evidencia_del_turno
from app.application.chat.grafo import EstadoDelGrafo
from app.application.ports import ConsultaDeEvidencia, PosicionDeChunks
from app.domain.chat.bloques_de_evidencia import (
    CriterioParaMostrar,
    texto_de_la_opcion,
    texto_de_los_faltantes,
)
from app.domain.chat.mensajes import MENSAJE_SIN_OPCIONES_CON_SOPORTE, ORDEN_POR_APLICABILIDAD
from app.domain.chat.turno import BloqueDelTurno, TipoDeBloque
from app.domain.chat.ultima_evidencia import resumir_ultima_evidencia
from app.schemas.generated.models import RagQueryInternalResponse, RagQueryStatus

logger = logging.getLogger(__name__)


class NodoEvidencia:
    def __init__(self, *, consulta: ConsultaDeEvidencia, posiciones: PosicionDeChunks) -> None:
        self._consulta = consulta
        self._citas = ConstructorDeCitas(posiciones)

    async def ejecutar(self, estado: EstadoDelGrafo) -> dict[str, Any]:
        turno = evidencia_del_turno()
        consultada = await self._consulta.consultar_con_detalle(turno.consulta)
        respuesta = consultada.respuesta
        turno.resultado = respuesta
        bloques = await self._bloques_del(estado["trace_id"], respuesta)
        logger.info(
            "event=chat_evidencia traceId=%s status=%s opciones=%d descartadas=%d bloques=%d",
            estado["trace_id"],
            respuesta.status.value,
            len(respuesta.evidenceOptions),
            len(respuesta.discardedOptions),
            len(bloques),
        )
        return {
            "propuestas": (),
            "bloques_del_nodo": bloques,
            "omitidas_del_nodo": respuesta.omittedClaims,
            "evidencia_consultada": True,
            "opciones_mostradas": tuple(o.option for o in respuesta.evidenceOptions),
            "ultima_evidencia": resumir_ultima_evidencia(
                estado["pregunta"], consultada.chunk_ids_evaluados, respuesta.topRelevanceScore
            ),
        }

    async def _bloques_del(
        self, trace_id: str, respuesta: RagQueryInternalResponse
    ) -> tuple[BloqueDelTurno, ...]:
        """Un bloque `evidencia` con las opciones en el orden de RN-28 y sus citas del corpus; sin opciones, la limitación
        determinista de ``/rag/query`` (RN-02) o el aviso de que ninguna opción tuvo soporte."""
        if respuesta.status is RagQueryStatus.sin_evidencia:
            return tuple(
                BloqueDelTurno(TipoDeBloque.limitacion, lim.text) for lim in respuesta.limitations
            )
        if not respuesta.evidenceOptions:
            return (BloqueDelTurno(TipoDeBloque.limitacion, MENSAJE_SIN_OPCIONES_CON_SOPORTE),)
        fuentes = [
            FuenteDeCita(c.chunkId, c.title, c.chunkTextSnapshot)
            for opcion in respuesta.evidenceOptions
            for c in opcion.citedSources
        ]
        citas = await self._citas.construir(trace_id, fuentes)
        por_fuente = _criterios_por_fuente(respuesta)
        total = len(respuesta.evidenceOptions)
        mostrados: list[CriterioParaMostrar] = []
        bloques: list[BloqueDelTurno] = []
        for numero, opcion in enumerate(respuesta.evidenceOptions, start=1):
            externos = dict.fromkeys(c.externalId for c in opcion.citedSources)
            criterios = tuple(c for e in externos for c in por_fuente.get(e, ()))
            mostrados += criterios
            ids = dict.fromkeys(c.chunkId for c in opcion.citedSources)
            texto = texto_de_la_opcion(numero, total, opcion.option, opcion.rationale, criterios)
            bloques.append(
                BloqueDelTurno(TipoDeBloque.evidencia, texto, citas=tuple(citas[i] for i in ids))
            )
        bloques.append(BloqueDelTurno(TipoDeBloque.catalogo, ORDEN_POR_APLICABILIDAD))
        faltantes = texto_de_los_faltantes(mostrados)
        if faltantes is not None:
            bloques.append(BloqueDelTurno(TipoDeBloque.faltante, faltantes))
        bloques += [
            BloqueDelTurno(TipoDeBloque.limitacion, lim.text) for lim in respuesta.limitations
        ]
        return tuple(bloques)


def _criterios_por_fuente(
    respuesta: RagQueryInternalResponse,
) -> dict[str, tuple[CriterioParaMostrar, ...]]:
    """Los criterios de aplicabilidad de cada fuente (``externalId``), tal como los calculó ``/rag/query``."""
    return {
        fuente.externalId: tuple(
            CriterioParaMostrar(
                c.criterion,
                c.status.value,
                c.unknownReason.value if c.unknownReason is not None else None,
            )
            for c in fuente.criteria
        )
        for fuente in respuesta.applicability
    }
