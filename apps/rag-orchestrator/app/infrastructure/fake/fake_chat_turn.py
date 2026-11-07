"""Modo `LLM_PROVIDER=fake` del chat (US-034 AC-6, US-267 AC-1): el ejemplo de `contracts/examples/` de la pregunta.

La pregunta se enruta con las MISMAS reglas del motor real (``es_fuera_de_alcance``, ``clasificar_por_reglas``,
``es_seguimiento_de_evidencia``); sin regla, ``no_clasificada`` (el modo falso no tiene LLM que decida). El análisis de una
pregunta de evidencia es el que sirve `/rag/query` para esa misma pregunta (``FakeEvidenceQuery``): el panel muestra lo mismo
por el chat y por el endpoint de análisis, incluidos «sin evidencia» (``topRelevanceScore`` null, RN-02) y varias opciones.
"""

from collections.abc import Mapping
from pathlib import Path
from typing import Any

from app.application.chat.avisos import avisos_del_turno
from app.application.chat.bloques_de_la_respuesta import armar_bloques_de_evidencia
from app.application.chat.registro_de_hilos import RegistroDeHilos
from app.application.chat.traduccion import bloque_del_contrato
from app.config.settings import Settings
from app.domain.chat.ampliacion_de_busqueda import aviso_de_busqueda_ampliada
from app.domain.chat.enrutado import (
    clasificar_por_reglas,
    es_fuera_de_alcance,
    es_seguimiento_de_evidencia,
)
from app.domain.chat.estado import Intencion, Subintencion
from app.domain.chat.turno import CitaDelBloque
from app.infrastructure.fake.fake_evidence_query import FakeEvidenceQuery, leer_ejemplo
from app.schemas.generated.models import (
    ChatTurnRequest,
    ChatTurnResponse,
    RagQueryInternalResponse,
)

_ARCHIVOS: Mapping[Intencion | Subintencion, str] = {
    Intencion.caso: "chat-turn-caso-ok.json",
    Intencion.faltantes: "chat-turn-faltantes.json",
    Intencion.fuentes_limitaciones: "chat-turn-fuentes-ok.json",
    Intencion.no_clasificada: "chat-turn-no-clasificada.json",
    Intencion.fuera_de_alcance: "chat-turn-fuera-de-alcance.json",
    Subintencion.seguimiento_evidencia: "chat-turn-seguimiento-evidencia.json",
}


class FakeChatTurn:
    """Implementa `ChatTurnPort` sin grafo ni LLM; nunca inventa contenido: sirve el ejemplo del contrato o el análisis
    de ``FakeEvidenceQuery`` armado con las reglas puras del motor real.

    Admite los turnos por el MISMO ``RegistroDeHilos`` que el servicio real (TTL, desalojo y 404 de hilo desconocido), de
    modo que Backend 1 y el E2E ven la misma conducta de hilos con y sin LLM."""

    def __init__(
        self,
        ejemplos: Mapping[Intencion | Subintencion, ChatTurnResponse],
        registro: RegistroDeHilos,
        evidencia: FakeEvidenceQuery,
        settings: Settings,
        terminos_por_tipo: Mapping[str, frozenset[str]],
    ) -> None:
        self._ejemplos = ejemplos
        self._registro = registro
        self._evidencia = evidencia
        self._settings = settings
        self._terminos_por_tipo = terminos_por_tipo
        self._terminos_del_catalogo = frozenset().union(*terminos_por_tipo.values())

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
            ejemplos,
            registro,
            evidencia or FakeEvidenceQuery.desde_directorio(directorio),
            settings,
            terminos_por_tipo or {},
        )

    async def turno(self, solicitud: ChatTurnRequest) -> ChatTurnResponse:
        self._registro.admitir_turno(
            solicitud.threadId, con_rehidratacion=solicitud.rehydration is not None
        )
        return self._respuesta_para(solicitud)

    def _respuesta_para(self, solicitud: ChatTurnRequest) -> ChatTurnResponse:
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
            return self._turno_de_evidencia(pregunta)
        return self._ejemplos[por_reglas or Intencion.no_clasificada]

    def _intencion_por_reglas(self, pregunta: str) -> Intencion | None:
        """La pregunta de un ejemplo de ``/rag/query`` es de evidencia aunque nombre «fuentes» o un «faltante» (el LLM
        real decidiría por el sentido); el resto, por las reglas del motor."""
        if self._evidencia.es_pregunta_de_fixture(pregunta):
            return Intencion.evidencia
        return clasificar_por_reglas(pregunta, self._terminos_del_catalogo)

    def _turno_de_evidencia(self, pregunta: str) -> ChatTurnResponse:
        analisis = self._evidencia.select_fixture_response(pregunta)
        fuentes = [c for o in analisis.evidenceOptions for c in o.citedSources]
        citas = {
            c.chunkId: CitaDelBloque(c.chunkId, c.externalId, c.title, 1, 1, c.chunkTextSnapshot)
            for c in fuentes
        }
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
