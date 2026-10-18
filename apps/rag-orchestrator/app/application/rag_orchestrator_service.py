"""`RAGOrchestratorService`: implementa `EvidenceQueryPort` con el tramo de recuperación de `/rag/query` (US-055).

Cada etapa del pipeline es un método: recuperar → reranquear → umbral → (sin evidencia | generar). Las reglas viven
en `domain/`; aquí solo se orquestan los puertos. Sin chunks sobre el umbral no se invoca al generador, es decir, ni
al LLM ni al agente (RN-02).
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import TypeVar

from app.application.errores import RecuperacionNoDisponibleError, TipoCancerNoRegistradoError
from app.application.generador_fallando_cerrado import GeneradorFallandoCerrado
from app.application.ports import (
    ChunkEncontrado,
    ChunkSearch,
    Clock,
    CorpusReleaseReader,
    EvidenceGenerator,
    Idioma,
    LanguageDetector,
    QueryEmbedder,
    ReleaseDelCorpus,
    Reranker,
    ResultadoDeRecuperacion,
)
from app.application.resumen_contexto import resumen_del_contexto_clinico
from app.domain.normalizacion_puntaje import validar_puntaje_normalizado
from app.domain.relevance import ChunkPuntuado, filtrar_sobre_umbral, top_relevance_score
from app.domain.retrieval_filter import expresion_vigente_del_tipo
from app.schemas.generated.models import (
    Limitation,
    LlmProvider,
    Origin,
    RagMeta,
    RagQueryInternalRequest,
    RagQueryInternalResponse,
    RagQueryStatus,
    RetrievalMode,
    RetrievalParams,
    RetrievalStats,
    Synthesis,
)

logger = logging.getLogger(__name__)

LIMITACION_SIN_EVIDENCIA = "Ningún fragmento recuperado supera el umbral de relevancia."

_Resultado = TypeVar("_Resultado")


@dataclass(frozen=True)
class ParametrosDeRecuperacion:
    """Valores de configuración (RN-22) y versiones que acompañan a cada respuesta en ``meta``."""

    relevance_threshold: float
    retrieval_top_k: int
    rerank_top_n: int
    longitud_maxima_codigo_tipo: int
    llm_provider: LlmProvider
    llm_model: str
    nli_model: str
    prompt_version: str
    # Corte previo al reranker (RERANKER_MAX_PAIRS): ``None`` = sin corte (adapters falsos sin límite de pares).
    reranker_max_pairs: int | None = None


class RAGOrchestratorService:
    def __init__(
        self,
        *,
        detector_idioma: LanguageDetector,
        embedder: QueryEmbedder,
        buscador: ChunkSearch,
        reranker: Reranker,
        lector_release: CorpusReleaseReader,
        generador: EvidenceGenerator,
        reloj: Clock,
        parametros: ParametrosDeRecuperacion,
    ) -> None:
        self._detector_idioma = detector_idioma
        self._embedder = embedder
        self._buscador = buscador
        self._reranker = reranker
        self._lector_release = lector_release
        self._generador: EvidenceGenerator = GeneradorFallandoCerrado(generador)
        self._reloj = reloj
        self._parametros = parametros

    async def consultar(self, solicitud: RagQueryInternalRequest) -> RagQueryInternalResponse:
        trace_id = solicitud.traceId.root
        inicio = self._reloj.ahora()
        filtro = self._filtro_de_recuperacion(solicitud)  # antes de cualquier puerto (OL-02)
        borde = self._invocar_borde_fallando_cerrado
        idioma = await borde(trace_id, "idioma", self._detector_idioma.detectar, solicitud.query)
        release = await borde(trace_id, "catalogo", self._lector_release.release_vigente)
        candidatos = await self._recuperar(trace_id, solicitud, filtro)
        puntuados = await self._reranquear(trace_id, solicitud.query, candidatos)
        sobre_umbral = filtrar_sobre_umbral(puntuados, self._parametros.relevance_threshold)
        logger.info(
            "event=rag_query_recuperacion traceId=%s retrieved=%d aboveThreshold=%d",
            trace_id,
            len(candidatos),
            len(sobre_umbral),
        )
        meta_de_recuperacion = self._armar_meta_de_recuperacion(solicitud, idioma, release, inicio)
        if not sobre_umbral:
            return self._responder_sin_evidencia(len(candidatos), meta_de_recuperacion)
        recuperacion = ResultadoDeRecuperacion(
            tuple(sobre_umbral), len(candidatos), meta_de_recuperacion
        )
        return await self._generador.generar(solicitud, recuperacion)

    def _filtro_de_recuperacion(self, solicitud: RagQueryInternalRequest) -> str:
        """Filtro vigente y del tipo de cáncer del caso; sin código de catálogo no hay búsqueda (`422`, OL-02)."""
        diagnostico = solicitud.clinicalContext.diagnosis
        if diagnostico is None:
            raise TipoCancerNoRegistradoError()
        try:
            return expresion_vigente_del_tipo(
                diagnostico.cancerType.root, self._parametros.longitud_maxima_codigo_tipo
            )
        except ValueError:
            raise TipoCancerNoRegistradoError() from None

    async def _recuperar(
        self, trace_id: str, solicitud: RagQueryInternalRequest, filtro: str
    ) -> list[ChunkEncontrado]:
        """Búsqueda dense con el *embedding* de la pregunta y el del resumen del contexto; une sin repetir chunks."""
        textos = (solicitud.query, resumen_del_contexto_clinico(solicitud.clinicalContext))
        encontrados: dict[str, ChunkEncontrado] = {}
        for texto in textos:
            for chunk in await self._buscar_cercanos_a(trace_id, texto, filtro):
                encontrados.setdefault(chunk.chunk_id, chunk)
        # La similitud dense solo elige candidatos: nunca es relevance_score ni se compara con el umbral (RN-03).
        ordenados = sorted(encontrados.values(), key=lambda c: (-c.similitud_dense, c.chunk_id))
        return ordenados[: self._parametros.retrieval_top_k]

    async def _buscar_cercanos_a(
        self, trace_id: str, texto: str, filtro: str
    ) -> list[ChunkEncontrado]:
        borde = self._invocar_borde_fallando_cerrado
        vector = await borde(trace_id, "embeddings", self._embedder.embeber, texto)
        return await borde(
            trace_id,
            "busqueda",
            self._buscador.search_dense,
            vector,
            self._parametros.retrieval_top_k,
            filtro,
        )

    async def _reranquear(
        self, trace_id: str, pregunta: str, candidatos: Sequence[ChunkEncontrado]
    ) -> list[ChunkPuntuado]:
        """Puntúa todos los candidatos y conserva los ``RERANK_TOP_N`` de mayor `relevance_score` (orden estable)."""
        if not candidatos:
            return []
        crudos = await self._invocar_borde_fallando_cerrado(
            trace_id, "reranker", self._reranker.puntuar, pregunta, candidatos
        )
        puntajes = self._exigir_un_puntaje_normalizado_por_candidato(
            trace_id, crudos, len(candidatos)
        )
        puntuados = [
            ChunkPuntuado(c.chunk_id, c.document_id, c.chunk_text, p)
            for c, p in zip(candidatos, puntajes)
        ]
        puntuados.sort(key=lambda c: (-c.relevance_score, c.chunk_id))
        return puntuados[: self._parametros.rerank_top_n]

    @staticmethod
    def _exigir_un_puntaje_normalizado_por_candidato(
        trace_id: str, puntajes: Sequence[float], candidatos: int
    ) -> list[float]:
        """Un reranker que rompe su contrato (tipo, cantidad o rango) falla cerrado como recuperación no disponible."""
        try:
            materializados = list(
                puntajes
            )  # TypeError si no es iterable (None); materializa un generador
            if len(materializados) != candidatos:
                raise ValueError("el reranker debe devolver un puntaje por candidato")
            return [validar_puntaje_normalizado(p) for p in materializados]
        except (TypeError, ValueError) as error:
            logger.warning(
                "event=reranker_contrato_roto motivo=%s traceId=%s", type(error).__name__, trace_id
            )
            raise RecuperacionNoDisponibleError("reranker") from None

    def _armar_meta_de_recuperacion(
        self,
        solicitud: RagQueryInternalRequest,
        idioma: Idioma,
        release: ReleaseDelCorpus,
        inicio: datetime,
    ) -> RagMeta:
        """``meta`` con la latencia hasta el fin de la recuperación; la generación (L1D-275) la actualiza."""
        parametros = self._parametros
        return RagMeta(
            queryLanguage=idioma,
            responseLanguage=idioma,
            llmProvider=parametros.llm_provider,
            llmModel=parametros.llm_model,
            embeddingModel=self._embedder.modelo,
            rerankerModel=self._reranker.version,
            nliModel=parametros.nli_model,
            promptVersion=parametros.prompt_version,
            catalogVersion=solicitud.catalogVersion,
            corpusRelease=release.release_id,
            corpusCutoffDate=release.cutoff_date,
            excludedSources=list(release.excluded_sources),
            retrievalParams=RetrievalParams(
                topK=parametros.retrieval_top_k,
                rerankTopN=parametros.rerank_top_n,
                relevanceThreshold=parametros.relevance_threshold,
                retrievalMode=RetrievalMode.dense,
            ),
            latencyMs=int((self._reloj.ahora() - inicio).total_seconds() * 1000),
        )

    @staticmethod
    def _responder_sin_evidencia(recuperados: int, meta: RagMeta) -> RagQueryInternalResponse:
        """RN-02: `sin_evidencia` con `topRelevanceScore = null` (no 0.0) y sin haber invocado al generador."""
        return RagQueryInternalResponse(
            status=RagQueryStatus.sin_evidencia,
            synthesis=Synthesis(agreements=[], discrepancies=[]),
            applicability=[],
            evidenceOptions=[],
            discardedOptions=[],
            limitations=[Limitation(text=LIMITACION_SIN_EVIDENCIA, origin=Origin.estructural)],
            assumptions=[],
            retrievalStats=RetrievalStats(retrieved=recuperados, aboveThreshold=0),
            omittedClaims=0,
            agentSteps=[],
            topRelevanceScore=top_relevance_score([]),
            meta=meta,
        )

    @staticmethod
    async def _invocar_borde_fallando_cerrado(
        trace_id: str, etapa: str, funcion: Callable[..., _Resultado], *argumentos: object
    ) -> _Resultado:
        """Ejecuta un puerto bloqueante fuera del bucle; cualquier fallo es `RecuperacionNoDisponibleError` sin detalle.

        Solo se registran la clase del error y el ``traceId``: el mensaje y el traceback pueden traer el host del
        motor o el texto de la pregunta, y ``from None`` evita que lleguen al log de uvicorn.
        """
        try:
            return await asyncio.to_thread(funcion, *argumentos)
        except Exception as error:  # noqa: BLE001 - todo fallo de un borde es "recuperación no disponible"
            logger.warning(
                "event=recuperacion_fallo etapa=%s error=%s traceId=%s",
                etapa,
                type(error).__name__,
                trace_id,
            )
            raise RecuperacionNoDisponibleError(etapa) from None
