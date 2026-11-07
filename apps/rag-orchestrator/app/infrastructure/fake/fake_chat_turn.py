"""Modo `LLM_PROVIDER=fake` del chat (US-034 AC-6, US-267 AC-1): el ejemplo de `contracts/examples/` de la pregunta.

La pregunta se enruta con las MISMAS reglas del motor real (``es_fuera_de_alcance``, ``clasificar_por_reglas``,
``es_seguimiento_de_evidencia``); sin regla, ``no_clasificada`` (el modo falso no tiene LLM que decida). El análisis de una
pregunta de evidencia es el que sirve `/rag/query` para esa misma pregunta (``FakeEvidenceQuery``): el panel muestra lo mismo
por el chat y por el endpoint de análisis, incluidos «sin evidencia» (``topRelevanceScore`` null, RN-02) y varias opciones.
"""

import logging
import re
from collections.abc import Collection, Mapping
from pathlib import Path
from typing import Any

from app.application.chat.avisos import avisos_del_turno
from app.application.chat.bloques_de_la_respuesta import (
    armar_bloques_de_evidencia,
    fuentes_citadas_por_las_opciones,
)
from app.application.chat.citas import ConstructorDeCitas
from app.application.chat.registro_de_hilos import RegistroDeHilos
from app.application.chat.traduccion import bloque_del_contrato
from app.application.ports import PosicionDeChunk
from app.config.settings import Settings
from app.domain.chat.ampliacion_de_busqueda import aviso_de_busqueda_ampliada
from app.domain.chat.enrutado import (
    clasificar_por_reglas,
    es_fuera_de_alcance,
    es_pregunta_de_relevancia,
    es_seguimiento_de_evidencia,
)
from app.domain.chat.estado import Intencion, Subintencion
from app.domain.lenguaje import normalizar_texto
from app.infrastructure.fake.fake_evidence_query import FakeEvidenceQuery, leer_ejemplo
from app.schemas.generated.models import (
    ChatTurnRequest,
    ChatTurnResponse,
    RagQueryInternalResponse,
)

logger = logging.getLogger(__name__)

_ARCHIVOS: Mapping[Intencion | Subintencion, str] = {
    Intencion.caso: "chat-turn-caso-ok.json",
    Intencion.faltantes: "chat-turn-faltantes.json",
    Intencion.fuentes_limitaciones: "chat-turn-fuentes-ok.json",
    Intencion.no_clasificada: "chat-turn-no-clasificada.json",
    Intencion.fuera_de_alcance: "chat-turn-fuera-de-alcance.json",
    Subintencion.seguimiento_evidencia: "chat-turn-seguimiento-evidencia.json",
}

_ARCHIVOS_DE_PROSTATA: Mapping[Intencion, str] = {
    Intencion.caso: "chat-turn-caso-situacion-prostata.json",
    Intencion.faltantes: "chat-turn-faltantes-prostata.json",
    Intencion.fuentes_limitaciones: "chat-turn-fuentes-prostata.json",
}
"""La variante de próstata de cada intención con ejemplo propio; el resto sirve el ejemplo único (la evidencia sale del análisis)."""

_RELEVANCIA_POR_DATO: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"\bki 67\b"), "chat-turn-relevancia-sin-criterio.json"),
    (re.compile(r"\bmenopaus"), "chat-turn-relevancia-ok.json"),
    (re.compile(r"\bhrr\b|\bbrca\b"), "chat-turn-relevancia-prostata.json"),
)
_RELEVANCIA_DE_UN_DATO_FUERA_DEL_CATALOGO = "chat-turn-relevancia-fuera-de-catalogo.json"
"""«¿Por qué importa …?» sirve el ejemplo del dato que nombra la pregunta; un dato sin ejemplo propio, el de fuera del catálogo."""


class FakeChatTurn:
    """Implementa `ChatTurnPort` sin grafo ni LLM; nunca inventa contenido: sirve el ejemplo del contrato o el análisis
    de ``FakeEvidenceQuery`` armado con las reglas puras del motor real.

    Admite los turnos por el MISMO ``RegistroDeHilos`` que el servicio real (TTL, desalojo y 404 de hilo desconocido), de
    modo que Backend 1 y el E2E ven la misma conducta de hilos con y sin LLM."""

    def __init__(
        self,
        *,
        ejemplos: Mapping[Intencion | Subintencion, ChatTurnResponse],
        ejemplos_de_prostata: Mapping[Intencion, ChatTurnResponse],
        relevancia_por_dato: tuple[tuple[re.Pattern[str], ChatTurnResponse], ...],
        relevancia_fuera_del_catalogo: ChatTurnResponse,
        registro: RegistroDeHilos,
        evidencia: FakeEvidenceQuery,
        settings: Settings,
        terminos_por_tipo: Mapping[str, frozenset[str]],
    ) -> None:
        self._ejemplos = ejemplos
        self._ejemplos_de_prostata = ejemplos_de_prostata
        self._relevancia_por_dato = relevancia_por_dato
        self._relevancia_fuera_del_catalogo = relevancia_fuera_del_catalogo
        self._registro = registro
        self._evidencia = evidencia
        self._settings = settings
        self._terminos_por_tipo = terminos_por_tipo
        self._terminos_del_catalogo = frozenset().union(*terminos_por_tipo.values())
        if not terminos_por_tipo:
            logger.info(
                "event=chat_falso_sin_terminos_del_catalogo motivo=sin_sinonimos_o_sin_tipos"
            )

    @classmethod
    def desde_directorio(
        cls,
        directorio: Path,
        registro: RegistroDeHilos,
        settings: Settings,
        terminos_por_tipo: Mapping[str, frozenset[str]] | None = None,
        evidencia: FakeEvidenceQuery | None = None,
    ) -> "FakeChatTurn":
        ejemplos = {
            clave: leer_ejemplo(directorio / archivo, ChatTurnResponse)
            for clave, archivo in _ARCHIVOS.items()
        }
        return cls(
            ejemplos=ejemplos,
            ejemplos_de_prostata={
                intencion: leer_ejemplo(directorio / archivo, ChatTurnResponse)
                for intencion, archivo in _ARCHIVOS_DE_PROSTATA.items()
            },
            relevancia_por_dato=tuple(
                (patron, leer_ejemplo(directorio / archivo, ChatTurnResponse))
                for patron, archivo in _RELEVANCIA_POR_DATO
            ),
            relevancia_fuera_del_catalogo=leer_ejemplo(
                directorio / _RELEVANCIA_DE_UN_DATO_FUERA_DEL_CATALOGO, ChatTurnResponse
            ),
            registro=registro,
            evidencia=evidencia or FakeEvidenceQuery.desde_directorio(directorio),
            settings=settings,
            terminos_por_tipo=terminos_por_tipo or {},
        )

    async def turno(self, solicitud: ChatTurnRequest) -> ChatTurnResponse:
        self._registro.admitir_turno(
            solicitud.threadId, con_rehidratacion=solicitud.rehydration is not None
        )
        return await self._respuesta_para(solicitud)

    async def _respuesta_para(self, solicitud: ChatTurnRequest) -> ChatTurnResponse:
        pregunta = solicitud.question
        diagnostico = solicitud.clinicalContext.diagnosis
        tipo = diagnostico.cancerType.root if diagnostico is not None else ""
        if es_fuera_de_alcance(pregunta, tipo, self._terminos_por_tipo):
            return self._ejemplos[Intencion.fuera_de_alcance]
        por_reglas = self._intencion_por_reglas(pregunta)
        if por_reglas in (None, Intencion.evidencia) and es_seguimiento_de_evidencia(
            pregunta, solicitud.activeAnalysisId is not None
        ):
            return self._ejemplos[Subintencion.seguimiento_evidencia]
        if por_reglas is Intencion.evidencia:
            return await self._turno_de_evidencia(pregunta, solicitud.traceId.root)
        intencion = por_reglas or Intencion.no_clasificada
        if intencion is Intencion.faltantes and es_pregunta_de_relevancia(pregunta):
            return self._relevancia_del_dato(pregunta)
        if tipo == "prostata" and intencion in self._ejemplos_de_prostata:
            return self._ejemplos_de_prostata[intencion]
        return self._ejemplos[intencion]

    def _relevancia_del_dato(self, pregunta: str) -> ChatTurnResponse:
        texto = normalizar_texto(pregunta)
        return next(
            (ejemplo for patron, ejemplo in self._relevancia_por_dato if patron.search(texto)),
            self._relevancia_fuera_del_catalogo,
        )

    def _intencion_por_reglas(self, pregunta: str) -> Intencion | None:
        """La pregunta de un ejemplo de ``/rag/query`` es de evidencia aunque nombre «fuentes» o un «faltante» (el LLM
        real decidiría por el sentido); el resto, por las reglas del motor."""
        if self._evidencia.es_pregunta_de_fixture(pregunta):
            return Intencion.evidencia
        return clasificar_por_reglas(pregunta, self._terminos_del_catalogo)

    async def _turno_de_evidencia(self, pregunta: str, trace_id: str) -> ChatTurnResponse:
        analisis = self._evidencia.select_fixture_response(pregunta)
        fuentes = fuentes_citadas_por_las_opciones(analisis)
        citas = await ConstructorDeCitas(_PosicionesDelAnalisis(analisis)).construir(
            trace_id, fuentes
        )
        # El análisis solo expone ``retrievalStats.retrieved`` (candidatos antes del reranker); el motor real cuenta los
        # evaluados por el reranker. El modo falso dice ese mismo número en el alcance, sin inventar otro.
        bloques = armar_bloques_de_evidencia(analisis, citas, analisis.retrievalStats.retrieved)
        return ChatTurnResponse.model_validate(
            {
                "intent": Intencion.evidencia.value,
                "evidenceAnalysis": analisis,
                "blocks": [bloque_del_contrato(b) for b in bloques],
                "omittedClaims": analisis.omittedClaims,
                "structuredState": _estado_de_evidencia(pregunta, analisis, list(citas)),
                "llmProvider": self._ejemplos[Intencion.caso].llmProvider,
                "notices": [
                    *avisos_del_turno(self._settings, Intencion.evidencia),
                    *self._aviso_de_la_ampliacion(analisis),
                ],
            }
        )

    def _aviso_de_la_ampliacion(self, analisis: RagQueryInternalResponse) -> list[str]:
        expansion = analisis.meta.retrievalParams.contextExpansion
        if expansion is None:
            return []
        campos = [campo.value for campo in expansion.fields]
        return [aviso_de_busqueda_ampliada(self._settings.chat_aviso_busqueda_ampliada, campos)]


def _estado_de_evidencia(
    pregunta: str, analisis: RagQueryInternalResponse, chunk_ids: list[str]
) -> dict[str, Any]:
    """``structuredState`` tras un turno de evidencia; ``topRelevanceScore`` null si no hubo evidencia (RN-02)."""
    return {
        "intentsVistos": [Intencion.evidencia.value],
        "preguntasPrevias": [pregunta],
        "opcionesMostradas": [o.option for o in analisis.evidenceOptions],
        "citasMostradas": chunk_ids,
        "faltantesSenalados": [],
        "ultimaEvidencia": {
            "query": pregunta,
            "chunkIds": chunk_ids,
            "topRelevanceScore": analisis.topRelevanceScore,
        },
    }


class _PosicionesDelAnalisis:
    """``PosicionDeChunks`` fingido: el documento es la ``externalId`` de la fuente y la posición, la de cada chunk citado
    en el análisis (ordinal desde 1 en el orden de aparición; cantidad = chunks distintos citados de ese documento).
    Cumple el contrato del puerto real: solo devuelve los chunks pedidos que el análisis cita."""

    def __init__(self, analisis: RagQueryInternalResponse) -> None:
        por_documento: dict[str, list[str]] = {}
        for opcion in analisis.evidenceOptions:
            for fuente in opcion.citedSources:
                chunks = por_documento.setdefault(fuente.externalId, [])
                if fuente.chunkId not in chunks:
                    chunks.append(fuente.chunkId)
        self._posiciones = {
            chunk: PosicionDeChunk(documento, ordinal, len(chunks))
            for documento, chunks in por_documento.items()
            for ordinal, chunk in enumerate(chunks, start=1)
        }

    def posiciones(self, chunk_ids: Collection[str]) -> dict[str, PosicionDeChunk]:
        return {c: self._posiciones[c] for c in chunk_ids if c in self._posiciones}
