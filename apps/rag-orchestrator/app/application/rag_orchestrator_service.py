"""`RAGOrchestratorService`: implementa `EvidenceQueryPort` con el tramo de recuperación de `/rag/query` (US-055).

Cada etapa del pipeline es un método: recuperar → cortar a los pares del reranker → reranquear → umbral →
(sin evidencia | generar). Las reglas viven
en `domain/`; aquí solo se orquestan los puertos. Sin chunks sobre el umbral no se invoca al generador, es decir, ni
al LLM ni al agente (RN-02).
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable, Collection, Mapping, Sequence
from dataclasses import dataclass, replace
from datetime import datetime
from typing import NamedTuple, TypeVar

from app.application.aplicabilidad import (
    AplicabilidadDeFuente,
    ApplicabilityService,
    conflictos_para_el_log,
    formas_invalidas_para_el_log,
    mejor_chunk_por_documento,
    recuentos_para_el_log,
)
from app.application.aplicabilidad_de_opciones import (
    Reevaluar,
    con_aplicabilidad_de_cada_opcion,
    fuentes_con_los_fragmentos_citados,
)
from app.application.aplicabilidad_textual import (
    AplicabilidadCompleta,
    AplicabilidadTextual,
    ParametrosDelRespaldo,
)
from app.application.catalogo_exigido import exigir_catalogo_de_la_solicitud
from app.application.chunk_citable import ChunkCitable
from app.application.contexto_del_paciente import contexto_del_paciente
from app.application.errores import RecuperacionNoDisponibleError, TipoCancerNoRegistradoError
from app.application.generador_fallando_cerrado import GeneradorFallandoCerrado
from app.application.ports import (
    CandidatoDeRecuperacion,
    CatalogoClinico,
    ChunkEncontrado,
    ChunkEncontradoSparse,
    ChunkSearch,
    Clock,
    CorpusCatalogReader,
    CorpusReleaseReader,
    EvidenceGenerator,
    EvidenciaGenerada,
    Idioma,
    LanguageDetector,
    NliClassifier,
    PoblacionTask,
    ProhibitedTermsChecker,
    QueryEmbedder,
    QueryRewriter,
    QuerySparseEncoder,
    ReleaseDelCorpus,
    Reranker,
    ResultadoDeRecuperacion,
    SparseChunkSearch,
)
from app.application.respuesta_con_evidencia import ensamblar_respuesta_con_evidencia
from app.application.resumen_contexto import resumen_del_contexto_clinico
from app.application.verificacion_de_soporte import VerificadorDeSoporte
from app.domain.aplicabilidad_tipos import PoblacionDelEstudio
from app.domain.citations import (
    MotivoDeDescarte,
    OpcionAceptada,
    contar_por_motivo,
    validar_citas,
)
from app.domain.fusion_de_candidatos import (
    HYBRID_SPARSE_WEIGHT_INICIAL,
    RRF_K_INICIAL,
    CandidatoDeRama,
    EstrategiaDeFusion,
    fusionar_candidatos,
)
from app.domain.normalizacion_puntaje import validar_puntaje_normalizado
from app.domain.option_selection import (
    OpcionConRelevancia,
    RecorteDeOpciones,
    recortar_contando_excedente,
)
from app.domain.pares_del_reranker import recortar_a_pares_del_reranker
from app.domain.relevance import (
    ChunkPuntuado,
    filtrar_sobre_umbral,
    ordenar_por_relevancia,
    relevancia_de_opcion,
    top_relevance_score,
)
from app.domain.lenguaje import normalizar_texto
from app.domain.reescritura import (
    EstadoDeReescritura,
    MotivoDeReescritura,
    ParametrosDeReescritura,
    conservar_pregunta_original,
    debe_reescribir,
    filtrar_terminos_del_catalogo,
)
from app.domain.retrieval_filter import expresion_vigente_del_tipo
from app.domain.tipos_habilitados import exigir_tipo_habilitado
from app.prompts.rag_query import VERSION_DEL_PROMPT
from app.schemas.generated.models import (
    Fusion,
    Limitation,
    LlmProvider,
    Origin,
    QueryRewrite,
    RagMeta,
    RagQueryInternalRequest,
    RagQueryInternalResponse,
    RagQueryStatus,
    Reason,
    RetrievalMode,
    RetrievalParams,
    RetrievalStats,
    Synthesis,
)

logger = logging.getLogger(__name__)

LIMITACION_SIN_EVIDENCIA = "Ningún fragmento recuperado supera el umbral de relevancia."

_Resultado = TypeVar("_Resultado")


class ResultadoDelLoop(NamedTuple):
    """Lo que deja un loop de recuperación: los candidatos que vio el reranker y los que superan el umbral."""

    candidatos: list[CandidatoDeRecuperacion]
    sobre_umbral: list[ChunkPuntuado]


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
    claim_max_words: int
    """``CLAIM_MAX_WORDS`` (US-245, RN-22): palabras máximas de una afirmación atómica; más es «fuera de forma»."""
    respaldo: ParametrosDelRespaldo
    """Plazo, concurrencia y versión del prompt del respaldo de la población (US-244, RN-22)."""
    reranker_max_pairs: int | None = None
    """Tope de pares que admite el reranker (``RERANKER_MAX_PAIRS``); ``None`` = el reranker no limita y no se recorta."""
    retrieval_mode: RetrievalMode = RetrievalMode.dense
    """``RETRIEVAL_MODE`` (US-112, RN-22): ``dense`` por defecto; ``hibrida`` suma la rama *sparse* antes del reranker."""
    retrieval_fusion: EstrategiaDeFusion = EstrategiaDeFusion.rrf
    """``RETRIEVAL_FUSION``: regla que fusiona las dos ramas; solo se usa con ``retrieval_mode = hibrida``."""
    rrf_k: int = RRF_K_INICIAL
    """``RRF_K``: constante de ``Σ 1/(k+rank)``; solo con ``retrieval_fusion = rrf``."""
    peso_sparse: float = HYBRID_SPARSE_WEIGHT_INICIAL
    """``HYBRID_SPARSE_WEIGHT``: peso de la rama *sparse* (0 < w < 1); solo con ``retrieval_fusion = ponderada``."""
    reescritura: ParametrosDeReescritura = ParametrosDeReescritura()
    """``QUERY_REWRITE_*`` (US-238, RN-22): segundo loop de reescritura; desactivado por defecto."""


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
        proponente: PoblacionTask,
        generador: EvidenceGenerator,
        clasificador_nli: NliClassifier,
        verificador_terminos: ProhibitedTermsChecker,
        reloj: Clock,
        parametros: ParametrosDeRecuperacion,
        buscador_sparse: SparseChunkSearch | None = None,
        embedder_sparse: QuerySparseEncoder | None = None,
        reescritor: QueryRewriter | None = None,
        terminos_del_catalogo: Collection[str] = (),
    ) -> None:
        self._reescritor = reescritor
        self._terminos_del_catalogo = frozenset(normalizar_texto(t) for t in terminos_del_catalogo)
        self._detector_idioma = detector_idioma
        self._embedder = embedder
        self._buscador = buscador
        if parametros.retrieval_mode is RetrievalMode.hibrida and (
            buscador_sparse is None or embedder_sparse is None
        ):
            raise ValueError("RETRIEVAL_MODE=hibrida exige la búsqueda y el codificador sparse")
        self._buscador_sparse = buscador_sparse
        self._embedder_sparse = embedder_sparse
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
            max_palabras_por_afirmacion=parametros.claim_max_words,
        )
        self._textual = AplicabilidadTextual(
            proponente=proponente,
            parametros=parametros.respaldo,
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
        loop = await self._recuperar_y_puntuar(trace_id, solicitud, filtro, solicitud.query, 1)
        loop, reescritura = await self._segundo_loop_si_corresponde(
            trace_id, solicitud, filtro, loop
        )
        candidatos, sobre_umbral = loop
        meta_de_recuperacion = self._armar_meta_de_recuperacion(
            solicitud, idioma, release, inicio, reescritura
        )
        if not sobre_umbral:
            return self._responder_sin_evidencia(len(candidatos), meta_de_recuperacion)
        recuperacion = ResultadoDeRecuperacion(
            tuple(sobre_umbral), len(candidatos), meta_de_recuperacion
        )
        evidencia = await self._generador.generar(solicitud, recuperacion)
        return await self._validar_citas_y_ensamblar(solicitud, evidencia, recuperacion)

    async def _recuperar_y_puntuar(
        self,
        trace_id: str,
        solicitud: RagQueryInternalRequest,
        filtro: str,
        texto_de_busqueda: str,
        numero_de_loop: int,
    ) -> ResultadoDelLoop:
        """Un loop: recuperar → cortar → reranquear → umbral. Solo el vector depende de ``texto_de_busqueda``; el
        *reranker* puntúa siempre contra la pregunta original (RN-03, RN-06)."""
        candidatos = await self._recuperar(trace_id, solicitud, filtro, texto_de_busqueda)
        a_reranquear = self._cortar_a_pares_del_reranker(trace_id, candidatos)
        puntuados = await self._reranquear(trace_id, solicitud.query, a_reranquear)
        sobre_umbral = filtrar_sobre_umbral(puntuados, self._parametros.relevance_threshold)
        logger.info(
            "event=rag_query_recuperacion traceId=%s loop=%d retrieved=%d aboveThreshold=%d",
            trace_id,
            numero_de_loop,
            len(candidatos),
            len(sobre_umbral),
        )
        return ResultadoDelLoop(candidatos, sobre_umbral)

    async def _segundo_loop_si_corresponde(
        self,
        trace_id: str,
        solicitud: RagQueryInternalRequest,
        filtro: str,
        primero: ResultadoDelLoop,
    ) -> tuple[ResultadoDelLoop, EstadoDeReescritura]:
        """RN-02 enmendada: con el primer loop vacío, hasta ``QUERY_REWRITE_MAX_ITERATIONS`` loops con la consulta
        reformulada con términos del catálogo. Sin reformulación utilizable el resultado es el del loop previo."""
        parametros = self._parametros.reescritura
        habilitada = parametros.habilitada and self._reescritor is not None
        loop, iteracion = primero, 0
        while debe_reescribir(
            len(loop.sobre_umbral), habilitada, iteracion, parametros.max_iteraciones
        ):
            terminos = await self._terminos_para_reescribir(trace_id, solicitud.query)
            if terminos is None:
                motivo = (
                    MotivoDeReescritura.disparado
                    if iteracion
                    else MotivoDeReescritura.no_disponible
                )
                return loop, EstadoDeReescritura(motivo)
            consulta = conservar_pregunta_original(solicitud.query, terminos)
            iteracion += 1
            loop = await self._recuperar_y_puntuar(
                trace_id, solicitud, filtro, consulta.texto_de_busqueda, iteracion + 1
            )
        motivo = MotivoDeReescritura.disparado if iteracion else MotivoDeReescritura.no_disparado
        return loop, EstadoDeReescritura(motivo)

    async def _terminos_para_reescribir(self, trace_id: str, pregunta: str) -> tuple[str, ...] | None:
        """Términos del catálogo que propone el LLM local, o ``None`` si no hay reformulación utilizable (D4: LLM caído,
        plazo vencido, salida inválida o cero términos admitidos). Se registra solo ``reason`` y la clase del error:
        nunca el mensaje de la excepción ni la pregunta, la reformulación o la salida del LLM (RN-10, RN-14)."""
        reescritor = self._reescritor
        if reescritor is None:
            raise RuntimeError("la reescritura se pidió sin QueryRewriter (el servicio lo impide)")
        inicio = self._reloj.ahora()
        plazo_s = self._parametros.reescritura.plazo_ms / 1000
        error: str | None = None
        terminos: tuple[str, ...] = ()
        try:
            propuestos = await asyncio.wait_for(reescritor.reformular(pregunta), timeout=plazo_s)
            terminos = filtrar_terminos_del_catalogo(propuestos, self._terminos_del_catalogo)
        except Exception as fallo:  # noqa: BLE001 - cualquier fallo del LLM de reescritura cae a "sin evidencia"
            error = type(fallo).__name__
        latencia_ms = int((self._reloj.ahora() - inicio).total_seconds() * 1000)
        utilizable = error is None and bool(terminos)
        logger.info(
            "event=rag_query_reescritura traceId=%s rewriteApplied=%s reason=%s terms=%d latencyMs=%d%s",
            trace_id,
            utilizable,
            MotivoDeReescritura.disparado if utilizable else MotivoDeReescritura.no_disponible,
            len(terminos),
            latencia_ms,
            f" error={error}" if error else "",
        )
        return terminos if utilizable else None

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
        por_motivo = contar_por_motivo(resultado.descartadas)
        logger.info(
            "event=rag_query_citas traceId=%s opcionesAceptadas=%d opcionesDescartadas=%d"
            " sinCitas=%d citaInvalida=%d",
            trace_id,
            len(resultado.aceptadas),
            len(resultado.descartadas),
            por_motivo[MotivoDeDescarte.sin_citas],
            por_motivo[MotivoDeDescarte.cita_invalida],
        )
        textos = {chunk_id: c.chunk.chunk_text for chunk_id, c in citables.items()}
        soporte = await self._soporte.verificar(
            trace_id, idioma, resultado.aceptadas, evidencia.limitaciones_propuestas, textos
        )
        reevaluar = self._reevaluador_de_aplicabilidad(solicitud)
        recortadas = self._recortar_soportadas(
            trace_id, soporte.soportadas, citables, solicitud, aplicabilidad.fuentes, reevaluar
        )
        fuentes = fuentes_con_los_fragmentos_citados(
            aplicabilidad.fuentes, recortadas.conservadas, citables, reevaluar
        )
        self._registrar_conflictos(trace_id, fuentes)
        return ensamblar_respuesta_con_evidencia(
            recortadas.conservadas,
            recortadas.excedente,
            self._soporte.sanear_descartadas(trace_id, idioma, resultado.descartadas),
            soporte.descartadas,
            soporte.limitaciones,
            soporte.omitidas + aplicabilidad.omitidas,
            citables,
            recuperacion,
            fuentes,
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
        self._registrar_formas_invalidas(trace_id, poblaciones)
        fuentes = self._aplicabilidad.evaluar(
            tipo, contexto_del_paciente(solicitud.clinicalContext), mejores, poblaciones
        )
        self._registrar_aplicabilidad(trace_id, fuentes, inicio)
        return await self._textual.completar(trace_id, tipo, fuentes, citables)

    def _reevaluador_de_aplicabilidad(self, solicitud: RagQueryInternalRequest) -> Reevaluar:
        """Recalcula una fuente con los fragmentos que cita una opción (ADR-47); sin diagnóstico no hay fuentes."""
        diagnostico = solicitud.clinicalContext.diagnosis
        if diagnostico is None:
            return lambda fuente, _: fuente
        tipo = diagnostico.cancerType.root
        contexto = contexto_del_paciente(solicitud.clinicalContext)
        return lambda fuente, chunk_ids: self._aplicabilidad.con_chunks_citados(
            tipo, contexto, fuente, chunk_ids
        )

    @staticmethod
    def _registrar_conflictos(trace_id: str, fuentes: Sequence[AplicabilidadDeFuente]) -> None:
        """Valores en conflicto entre fragmentos (US-243): criterio, ``chunkId`` y ``traceId``; nunca el valor, el texto del
        fragmento, el prompt ni la salida del LLM (RN-14)."""
        for criterio, chunk_id in conflictos_para_el_log(fuentes):
            logger.info(
                "event=poblacion_conflicto criterio=%s chunkId=%s traceId=%s",
                criterio,
                chunk_id,
                trace_id,
            )

    def _con_version_de_aplicabilidad(
        self, recuperacion: ResultadoDeRecuperacion
    ) -> ResultadoDeRecuperacion:
        """``meta.promptVersion`` lleva también la del prompt del respaldo de población cuando se invocó al LLM (US-244)."""
        version = (
            f"{recuperacion.meta.promptVersion}+{self._parametros.respaldo.version_del_prompt}"
        )
        return replace(
            recuperacion, meta=recuperacion.meta.model_copy(update={"promptVersion": version})
        )

    @staticmethod
    def _registrar_formas_invalidas(
        trace_id: str, poblaciones: Mapping[str, PoblacionDelEstudio]
    ) -> None:
        """Un criterio de población con forma inválida queda sin valor y el análisis sigue (RN-26). Criterio, ``chunkId`` y
        ``traceId``; nunca el valor, el texto del fragmento, el prompt ni la salida del LLM (RN-14)."""
        for criterio, chunk_id in formas_invalidas_para_el_log(poblaciones):
            logger.warning(
                "event=poblacion_forma_invalida criterio=%s chunkId=%s traceId=%s",
                criterio,
                chunk_id or "sin_chunk",
                trace_id,
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
        fuentes: Sequence[AplicabilidadDeFuente],
        reevaluar: Reevaluar,
    ) -> RecorteDeOpciones:
        """FR-09, RN-28: agrega la aplicabilidad de cada opción ya soportada y conserva las ``maxOptions`` más aplicables.

        El orden va después del soporte y antes del recorte: una descartada nunca ocupa posición. El excedente se omite
        (no es una opción descartada) y solo se cuenta; las de población no comparable se conservan con su aviso y se cuentan en el log.
        """
        puntajes = {chunk_id: c.chunk.relevance_score for chunk_id, c in citables.items()}
        soportadas = con_aplicabilidad_de_cada_opcion(
            [_con_relevancia(aceptada, puntajes) for aceptada in aceptadas],
            fuentes,
            citables,
            puntajes,
            reevaluar,
        )
        recorte = recortar_contando_excedente(soportadas, solicitud.maxOptions)
        logger.info(
            "event=rag_query_recorte traceId=%s opcionesRecortadas=%d opcionesNoComparables=%d",
            trace_id,
            recorte.excedente,
            sum(
                1
                for o in recorte.conservadas
                if o.aplicabilidad and o.aplicabilidad.poblacion_no_comparable
            ),
        )
        return recorte

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
        self,
        trace_id: str,
        solicitud: RagQueryInternalRequest,
        filtro: str,
        texto_de_busqueda: str,
    ) -> list[CandidatoDeRecuperacion]:
        """Candidatos para el reranker: dense; en modo híbrido, dense + sparse fusionados (RN-05: un solo filtro)."""
        dense = await self._recuperar_dense(trace_id, solicitud, filtro, texto_de_busqueda)
        if self._parametros.retrieval_mode is RetrievalMode.dense:
            return self._recortar_a_top_k(dense)
        sparse = await self._recuperar_sparse(trace_id, texto_de_busqueda, filtro)
        recortados = self._recortar_a_top_k(self._unir_ramas(dense, sparse))
        self._registrar_recuperacion_hibrida(trace_id, len(dense), len(sparse), len(recortados))
        return recortados

    def _recortar_a_top_k(
        self, ordenados: Sequence[CandidatoDeRecuperacion]
    ) -> list[CandidatoDeRecuperacion]:
        """Los ``RETRIEVAL_TOP_K`` primeros de una lista ya ordenada por puntaje de recuperación (nunca relevance_score)."""
        return list(ordenados[: self._parametros.retrieval_top_k])

    def _registrar_recuperacion_hibrida(
        self, trace_id: str, dense: int, sparse: int, fusionados: int
    ) -> None:
        """Solo recuentos y parámetros: nunca la pregunta ni el texto de un fragmento (RN-10)."""
        fusion, fusion_param = self._fusion_trazada()
        logger.info(
            "event=rag_query_recuperacion_hibrida traceId=%s retrievalMode=%s fusion=%s fusionParam=%s "
            "dense=%d sparse=%d fused=%d",
            trace_id,
            self._parametros.retrieval_mode.value,
            fusion.value,
            fusion_param,
            dense,
            sparse,
            fusionados,
        )

    async def _recuperar_dense(
        self,
        trace_id: str,
        solicitud: RagQueryInternalRequest,
        filtro: str,
        texto_de_busqueda: str,
    ) -> list[CandidatoDeRecuperacion]:
        """Búsqueda dense con el *embedding* del texto de búsqueda y el del resumen del contexto; une sin repetir chunks."""
        textos = (texto_de_busqueda, resumen_del_contexto_clinico(solicitud.clinicalContext))
        encontrados: dict[str, ChunkEncontrado] = {}
        for texto in textos:
            for chunk in await self._buscar_cercanos_a(trace_id, texto, filtro):
                encontrados.setdefault(chunk.chunk_id, chunk)
        candidatos = [
            CandidatoDeRecuperacion(c.chunk_id, c.document_id, c.chunk_text, c.similitud_dense)
            for c in encontrados.values()
        ]
        return sorted(candidatos, key=lambda c: (-c.puntaje_de_recuperacion, c.chunk_id))

    async def _recuperar_sparse(
        self, trace_id: str, pregunta: str, filtro: str
    ) -> list[ChunkEncontradoSparse]:
        """Búsqueda sparse solo con la pregunta (el resumen del contexto aportaría léxico común, no discriminante)."""
        codificador, buscador = self._embedder_sparse, self._buscador_sparse
        if codificador is None or buscador is None:
            raise RuntimeError(
                "la rama sparse se pidió sin codificador ni búsqueda (el constructor lo impide)"
            )
        borde = self._invocar_borde_fallando_cerrado
        vector = await borde(trace_id, "embeddings", codificador.embeber_sparse, pregunta)
        return await borde(
            trace_id,
            "busqueda",
            buscador.search_sparse,
            vector,
            self._parametros.retrieval_top_k,
            filtro,
        )

    def _unir_ramas(
        self, dense: Sequence[CandidatoDeRecuperacion], sparse: Sequence[ChunkEncontradoSparse]
    ) -> list[CandidatoDeRecuperacion]:
        """Fusiona las ramas con la regla de dominio; el puntaje de cada candidato pasa a ser el de la fusión.

        El puntaje fusionado solo elige y ordena candidatos (no es relevancia, RN-03): así el corte previo al reranker
        respeta el orden de la fusión, también con chunks que solo halló la rama sparse.
        """
        parametros = self._parametros
        por_id = {c.chunk_id: c for c in dense}
        for chunk in sparse:
            por_id.setdefault(
                chunk.chunk_id,
                CandidatoDeRecuperacion(
                    chunk.chunk_id, chunk.document_id, chunk.chunk_text, chunk.similitud_sparse
                ),
            )
        fusionados = fusionar_candidatos(
            [CandidatoDeRama(c.chunk_id, c.puntaje_de_recuperacion) for c in dense],
            [CandidatoDeRama(c.chunk_id, c.similitud_sparse) for c in sparse],
            parametros.retrieval_fusion,
            rrf_k=parametros.rrf_k,
            peso_sparse=parametros.peso_sparse,
        )
        return [replace(por_id[f.chunk_id], puntaje_de_recuperacion=f.puntaje) for f in fusionados]

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
        self, trace_id: str, candidatos: Sequence[CandidatoDeRecuperacion]
    ) -> list[CandidatoDeRecuperacion]:
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
        self, trace_id: str, pregunta: str, candidatos: Sequence[CandidatoDeRecuperacion]
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
        reescritura: EstadoDeReescritura = EstadoDeReescritura(MotivoDeReescritura.no_disparado),
    ) -> RagMeta:
        """``meta`` con la latencia hasta el fin de la recuperación; la generación (L1D-275) la actualiza."""
        parametros = self._parametros
        fusion, fusion_param = self._fusion_trazada()
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
                retrievalMode=parametros.retrieval_mode,
                fusion=fusion,
                fusionParam=fusion_param,
                queryRewrite=QueryRewrite(
                    applied=reescritura.applied, reason=Reason(reescritura.motivo.value)
                ),
            ),
            latencyMs=int((self._reloj.ahora() - inicio).total_seconds() * 1000),
        )

    def _fusion_trazada(self) -> tuple[Fusion, float]:
        """``(fusion, fusionParam)`` de ``meta`` sin nulos (D7): ``ninguna``/0 en dense; ``rrf``/k o ``ponderada``/peso."""
        parametros = self._parametros
        if parametros.retrieval_mode is RetrievalMode.dense:
            return Fusion.ninguna, 0
        if parametros.retrieval_fusion is EstrategiaDeFusion.rrf:
            return Fusion.rrf, parametros.rrf_k
        return Fusion.ponderada, parametros.peso_sparse

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
            optionsNotShown=0,
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
