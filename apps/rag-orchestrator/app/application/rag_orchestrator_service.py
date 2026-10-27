"""`RAGOrchestratorService`: implementa `EvidenceQueryPort` con el tramo de recuperación de `/rag/query` (US-055).

Cada etapa del pipeline es un método: recuperar → cortar a los pares del reranker → reranquear → umbral →
(sin evidencia | generar). Las reglas viven
en `domain/`; aquí solo se orquestan los puertos. Sin chunks sobre el umbral no se invoca al generador, es decir, ni
al LLM ni al agente (RN-02).
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, replace
from datetime import datetime
from typing import TypeVar

from app.application.aplicabilidad import (
    AplicabilidadDeFuente,
    ApplicabilityService,
    mejor_chunk_por_documento,
    recuentos_para_el_log,
)
from app.application.aplicabilidad_textual import AplicabilidadCompleta, AplicabilidadTextual
from app.application.catalogo_exigido import exigir_catalogo_de_la_solicitud
from app.application.chunk_citable import ChunkCitable
from app.application.contexto_del_paciente import contexto_del_paciente
from app.application.errores import RecuperacionNoDisponibleError, TipoCancerNoRegistradoError
from app.application.generador_fallando_cerrado import GeneradorFallandoCerrado
from app.application.ports import (
    ApplicabilityTextProposer,
    CatalogoClinico,
    ChunkEncontrado,
    ChunkSearch,
    Clock,
    CorpusCatalogReader,
    CorpusReleaseReader,
    EvidenceGenerator,
    EvidenciaGenerada,
    Idioma,
    LanguageDetector,
    NliClassifier,
    ProhibitedTermsChecker,
    QueryEmbedder,
    ReleaseDelCorpus,
    Reranker,
    ResultadoDeRecuperacion,
)
from app.application.respuesta_con_evidencia import ensamblar_respuesta_con_evidencia
from app.application.resumen_contexto import resumen_del_contexto_clinico
from app.application.verificacion_de_soporte import VerificadorDeSoporte
from app.domain.citations import OpcionAceptada, validar_citas
from app.domain.normalizacion_puntaje import validar_puntaje_normalizado
from app.domain.option_selection import OpcionConRelevancia, recortar_a_max_opciones
from app.domain.pares_del_reranker import recortar_a_pares_del_reranker
from app.domain.relevance import (
    ChunkPuntuado,
    filtrar_sobre_umbral,
    ordenar_por_relevancia,
    relevancia_de_opcion,
    top_relevance_score,
)
from app.domain.retrieval_filter import expresion_vigente_del_tipo
from app.domain.tipos_habilitados import exigir_tipo_habilitado
from app.prompts.aplicabilidad_texto import VERSION_DEL_PROMPT_APLICABILIDAD
from app.prompts.rag_query import VERSION_DEL_PROMPT
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
    nli_entailment_threshold: float
    tipos_habilitados: tuple[str, ...]
    """``ENABLED_CANCER_TYPES`` ya validada contra el manifiesto (RN-20); vacía = ningún tipo."""
    reranker_max_pairs: int | None = None
    """Tope de pares que admite el reranker (``RERANKER_MAX_PAIRS``); ``None`` = el reranker no limita y no se recorta."""


def _con_relevancia(aceptada: OpcionAceptada, puntajes: Mapping[str, float]) -> OpcionConRelevancia:
    """La opción con la relevancia y la cita principal que hereda de su chunk citado más relevante (RN-03)."""
    relevancia = relevancia_de_opcion(aceptada.chunk_ids_validos, puntajes)
    return OpcionConRelevancia(aceptada, relevancia.relevance_score, relevancia.chunk_principal_id)


class RAGOrchestratorService:
    def __init__(
        self,
        *,
        detector_idioma: LanguageDetector,
        embedder: QueryEmbedder,
        buscador: ChunkSearch,
        reranker: Reranker,
        lector_release: CorpusReleaseReader,
        catalogo: CorpusCatalogReader,
        catalogo_clinico: CatalogoClinico,
        aplicabilidad: ApplicabilityService,
        proponente: ApplicabilityTextProposer,
        generador: EvidenceGenerator,
        clasificador_nli: NliClassifier,
        verificador_terminos: ProhibitedTermsChecker,
        reloj: Clock,
        parametros: ParametrosDeRecuperacion,
    ) -> None:
        self._detector_idioma = detector_idioma
        self._embedder = embedder
        self._buscador = buscador
        self._reranker = reranker
        self._lector_release = lector_release
        self._catalogo = catalogo
        self._catalogo_clinico = catalogo_clinico
        self._aplicabilidad = aplicabilidad
        self._generador: EvidenceGenerator = GeneradorFallandoCerrado(generador)
        self._reloj = reloj
        self._parametros = parametros
        self._soporte = VerificadorDeSoporte(
            clasificador=clasificador_nli,
            terminos=verificador_terminos,
            umbral=parametros.nli_entailment_threshold,
            reloj=reloj,
        )
        self._textual = AplicabilidadTextual(
            proponente=proponente,
            soporte=self._soporte,
            terminos=verificador_terminos,
            criterios_del=aplicabilidad.criterios_del,
            reloj=reloj,
        )

    async def consultar(self, solicitud: RagQueryInternalRequest) -> RagQueryInternalResponse:
        trace_id = solicitud.traceId.root
        # Primer paso, antes de todo borde (D2): un catálogo de otra versión no consume embeddings, Milvus, LLM ni NLI.
        exigir_catalogo_de_la_solicitud(self._catalogo_clinico, trace_id, solicitud.catalogVersion)
        inicio = self._reloj.ahora()
        filtro = self._filtro_de_recuperacion(solicitud)  # antes de cualquier puerto (OL-02)
        self._exigir_tipo_habilitado(
            solicitud
        )  # un tipo inutilizable ya fue 422 propio; aquí, antes de recuperar (RN-20)
        borde = self._invocar_borde_fallando_cerrado
        idioma = await borde(trace_id, "idioma", self._detector_idioma.detectar, solicitud.query)
        release = await borde(trace_id, "catalogo", self._lector_release.release_vigente)
        candidatos = await self._recuperar(trace_id, solicitud, filtro)
        a_reranquear = self._cortar_a_pares_del_reranker(trace_id, candidatos)
        puntuados = await self._reranquear(trace_id, solicitud.query, a_reranquear)
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
        evidencia = await self._generador.generar(solicitud, recuperacion)
        return await self._validar_citas_y_ensamblar(solicitud, evidencia, recuperacion)

    async def _validar_citas_y_ensamblar(
        self,
        solicitud: RagQueryInternalRequest,
        evidencia: EvidenciaGenerada,
        recuperacion: ResultadoDeRecuperacion,
    ) -> RagQueryInternalResponse:
        """RN-01 y RN-04: solo se cita lo recuperado en esta consulta, con metadatos del catálogo.

        Etapas: validar citas → soporte NLI y lenguaje (RN-01, RN-23) → recortar a ``maxOptions`` → ensamblar. El
        soporte va antes del recorte: se recortan opciones ya verificadas, nunca candidatas.
        """
        trace_id = solicitud.traceId.root
        idioma = recuperacion.meta.responseLanguage.value
        citables = await self._chunks_citables(trace_id, recuperacion)
        aplicabilidad = await self._evaluar_aplicabilidad(solicitud, citables)
        if aplicabilidad.invoco_al_llm:
            recuperacion = self._con_version_de_aplicabilidad(recuperacion)
        resultado = validar_citas(evidencia.opciones, citables.keys())
        logger.info(
            "event=rag_query_citas traceId=%s opcionesAceptadas=%d opcionesDescartadas=%d",
            trace_id,
            len(resultado.aceptadas),
            len(resultado.descartadas),
        )
        textos = {chunk_id: c.chunk.chunk_text for chunk_id, c in citables.items()}
        soporte = await self._soporte.verificar(
            trace_id, idioma, resultado.aceptadas, evidencia.limitaciones_propuestas, textos
        )
        recortadas = self._recortar_soportadas(trace_id, soporte.soportadas, citables, solicitud)
        return ensamblar_respuesta_con_evidencia(
            recortadas,
            self._soporte.sanear_descartadas(trace_id, idioma, resultado.descartadas),
            soporte.descartadas,
            soporte.limitaciones,
            soporte.omitidas + aplicabilidad.omitidas,
            citables,
            recuperacion,
            aplicabilidad.fuentes,
        )

    async def _evaluar_aplicabilidad(
        self, solicitud: RagQueryInternalRequest, citables: Mapping[str, ChunkCitable]
    ) -> AplicabilidadCompleta:
        """FR-25: criterio a criterio por fuente recuperada, sin puntaje (RN-28, ADR-34 b).

        Primero el cálculo estructurado, determinista y sin LLM; después el camino textual para lo que la fuente no trae
        estructurado (US-123). Solo corre en la rama con evidencia (RN-02) y no depende de las opciones generadas. Sin
        criterios en el catálogo para el tipo no hay nada que leer del corpus. Solo se registran recuentos, nunca valores.
        """
        trace_id = solicitud.traceId.root
        diagnostico = solicitud.clinicalContext.diagnosis
        if diagnostico is None:
            return AplicabilidadCompleta(())
        tipo = diagnostico.cancerType.root
        if not self._aplicabilidad.criterios_del(tipo):
            return AplicabilidadCompleta(())
        inicio = self._reloj.ahora()
        mejores = mejor_chunk_por_documento(citables)
        poblaciones = await self._invocar_borde_fallando_cerrado(
            trace_id, "poblacion", self._catalogo.poblacion_por_documento, set(mejores)
        )
        fuentes = self._aplicabilidad.evaluar(
            tipo, contexto_del_paciente(solicitud.clinicalContext), mejores, poblaciones
        )
        self._registrar_aplicabilidad(trace_id, fuentes, inicio)
        return await self._textual.completar(trace_id, tipo, fuentes, citables)

    @staticmethod
    def _con_version_de_aplicabilidad(
        recuperacion: ResultadoDeRecuperacion,
    ) -> ResultadoDeRecuperacion:
        """``meta.promptVersion`` lleva también la del prompt de aplicabilidad cuando se invocó al LLM (design D6)."""
        version = f"{recuperacion.meta.promptVersion}+{VERSION_DEL_PROMPT_APLICABILIDAD}"
        return replace(
            recuperacion, meta=recuperacion.meta.model_copy(update={"promptVersion": version})
        )

    def _registrar_aplicabilidad(
        self, trace_id: str, fuentes: Sequence[AplicabilidadDeFuente], inicio: datetime
    ) -> None:
        recuentos = " ".join(f"{k}={v}" for k, v in recuentos_para_el_log(fuentes).items())
        latencia_ms = int((self._reloj.ahora() - inicio).total_seconds() * 1000)
        logger.info(
            "event=rag_query_aplicabilidad traceId=%s %s latenciaMs=%d",
            trace_id,
            recuentos,
            latencia_ms,
        )

    @staticmethod
    def _recortar_soportadas(
        trace_id: str,
        aceptadas: Sequence[OpcionAceptada],
        citables: dict[str, ChunkCitable],
        solicitud: RagQueryInternalRequest,
    ) -> tuple[OpcionConRelevancia, ...]:
        """FR-09: conserva ``maxOptions``; el excedente se omite (no es una opción descartada) y solo se cuenta."""
        puntajes = {chunk_id: c.chunk.relevance_score for chunk_id, c in citables.items()}
        soportadas = [_con_relevancia(aceptada, puntajes) for aceptada in aceptadas]
        recortadas = recortar_a_max_opciones(soportadas, solicitud.maxOptions, [])
        logger.info(
            "event=rag_query_recorte traceId=%s opcionesRecortadas=%d",
            trace_id,
            len(soportadas) - len(recortadas),
        )
        return recortadas

    async def _chunks_citables(
        self, trace_id: str, recuperacion: ResultadoDeRecuperacion
    ) -> dict[str, ChunkCitable]:
        """Los chunks sobre el umbral entregados a la generación cuyo documento tiene ficha en el catálogo."""
        chunks = recuperacion.chunks_sobre_umbral
        fichas = await self._invocar_borde_fallando_cerrado(
            trace_id,
            "catalogo",
            self._catalogo.fichas_por_documento,
            {chunk.document_id for chunk in chunks},
        )
        return {
            chunk.chunk_id: ChunkCitable(chunk, fichas[chunk.document_id])
            for chunk in chunks
            if chunk.document_id in fichas
        }

    def _exigir_tipo_habilitado(self, solicitud: RagQueryInternalRequest) -> None:
        """Sin diagnóstico no hay tipo que comprobar: lo rechaza ``_filtro_de_recuperacion`` (`422` propio)."""
        diagnostico = solicitud.clinicalContext.diagnosis
        if diagnostico is None:
            return
        exigir_tipo_habilitado(diagnostico.cancerType.root, self._parametros.tipos_habilitados)

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

    def _cortar_a_pares_del_reranker(
        self, trace_id: str, candidatos: Sequence[ChunkEncontrado]
    ) -> list[ChunkEncontrado]:
        """Decisión 82: al reranker solo van los ``RERANKER_MAX_PAIRS`` mejores por puntaje de recuperación.

        Se registran solo recuentos (recibidos, descartados, enviados): nunca ids ni texto de chunk.
        """
        maximo = self._parametros.reranker_max_pairs
        if maximo is None:
            return list(candidatos)
        enviados = recortar_a_pares_del_reranker(candidatos, maximo)
        logger.info(
            "event=rag_query_corte traceId=%s recibidos=%d descartados=%d enviados=%d",
            trace_id,
            len(candidatos),
            len(candidatos) - len(enviados),
            len(enviados),
        )
        return enviados

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
        return ordenar_por_relevancia(puntuados)[: self._parametros.rerank_top_n]

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
            nliModel=self._soporte.nli_model,
            promptVersion=VERSION_DEL_PROMPT,
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
