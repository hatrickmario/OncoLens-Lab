"""Raíz de composición: único lugar que conoce las clases concretas."""

from __future__ import annotations

import logging
from collections.abc import Callable
from dataclasses import dataclass
from typing import TYPE_CHECKING

from fastapi import FastAPI
from pydantic import ValidationError

from app.api.contencion_de_errores import ContencionDeErroresInesperados
from app.api.dependencies.service_jwt import DependenciaJwtServicio, crear_require_service_jwt
from app.api.errors import registrar_manejadores_de_error
from app.api.health import crear_router_health
from app.api.rag_query import crear_router_rag_query
from app.api.trace import ContextoDeTraceId
from app.application.consulta_no_componible import ConsultaNoComponible
from app.application.generation import LlmEvidenceGenerator
from app.application.ports import (
    ChunkSearch,
    Clock,
    CorpusCatalogReader,
    CorpusReleaseReader,
    EvidenceGenerator,
    EvidenceQueryPort,
    LanguageDetector,
    LlmHealthPort,
    NliClassifier,
    ProhibitedTermsChecker,
    PuertosDelCorpus,
    QueryEmbedder,
    Reranker,
    TraceIdGenerator,
)
from app.application.rag_orchestrator_service import (
    ParametrosDeRecuperacion,
    RAGOrchestratorService,
)
from app.config.errores_de_configuracion import describir_errores
from app.config.logging import silenciar_urls_de_httpx_en_logs
from app.config.settings import Settings, nombres_de_claves
from app.config.version import VERSION_DEL_SERVICIO
from app.infrastructure.clock.system_clock import RelojDelSistema
from app.infrastructure.fake.fake_evidence_query import FakeEvidenceQuery
from app.infrastructure.fake.fake_llm_health import FakeLlmHealth
from app.infrastructure.lenguaje.terminos_prohibidos import (
    ListaDeTerminosNoDisponible,
    cargar_verificador_de_terminos,
)
from app.infrastructure.llm.openai_compatible import OpenAICompatibleLlmClient
from app.infrastructure.llm.openai_compatible_health import OpenAICompatibleLlmHealth
from app.infrastructure.security.clave_publica import cargar_clave_publica_es256
from app.infrastructure.security.service_jwt_verifier import ServiceJwtVerifier
from app.infrastructure.trace.uuid_trace_id import UuidTraceIdGenerator
from app.schemas.generated.models import LlmProvider

if (
    TYPE_CHECKING
):  # solo para el tipado: importarlo en ejecución cargaría onnxruntime aun con MODEL_PROVIDER=fake
    from app.infrastructure.models.local import ModelosDeRecuperacion


logger = logging.getLogger(__name__)


class ConfiguracionDeRecuperacionIncompleta(ValueError):
    """Falta una clave de la recuperación de `/rag/query` (RN-22); el mensaje las nombra, nunca sus valores."""


@dataclass(frozen=True)
class PuertosDeRecuperacion:
    """Bordes de la recuperación que la composición recibe ya construidos (adapters reales tras L1D-102 o falsos de test)."""

    detector_idioma: LanguageDetector
    embedder: QueryEmbedder
    buscador: ChunkSearch
    reranker: Reranker
    lector_release: CorpusReleaseReader
    catalogo: CorpusCatalogReader
    clasificador_nli: NliClassifier
    verificador_terminos: ProhibitedTermsChecker


CargadorDeModelos = Callable[[Settings], "ModelosDeRecuperacion"]


def cargar_settings_o_salir() -> Settings:
    """Carga ``Settings`` una sola vez; si el entorno es inválido registra un ``configuracion_invalida`` por variable
    (nombre y regla, nunca el valor) y termina el proceso con código 1 antes de escuchar (US-037 AC-2, RN-22)."""
    try:
        return Settings()
    except ValidationError as error:
        for evento in describir_errores(error):
            logger.error(
                "configuracion_invalida", extra={"event": "configuracion_invalida", **evento}
            )
        raise SystemExit(1) from None


def crear_app(
    settings: Settings,
    *,
    llm_health: LlmHealthPort | None = None,
    trace_ids: TraceIdGenerator | None = None,
    clock: Clock | None = None,
    consulta: EvidenceQueryPort | None = None,
    recuperacion: PuertosDeRecuperacion | None = None,
    corpus: PuertosDelCorpus | None = None,
    cargador_de_modelos: CargadorDeModelos | None = None,
    generador: EvidenceGenerator | None = None,
) -> FastAPI:
    silenciar_urls_de_httpx_en_logs()
    modelos = _cargar_modelos_segun(settings, cargador_de_modelos)
    recuperacion = recuperacion or _componer_recuperacion(settings, modelos, corpus)
    trace_ids = trace_ids or UuidTraceIdGenerator()
    clock = clock or RelojDelSistema()
    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
    registrar_manejadores_de_error(app, trace_ids)
    app.add_middleware(ContencionDeErroresInesperados, trace_ids=trace_ids)
    app.add_middleware(
        ContextoDeTraceId, trace_ids=trace_ids
    )  # el más externo: fija el traceId de los logs
    verificador = _crear_verificador_jwt_de_servicio(settings, clock)
    _registrar_consulta_de_evidencia(
        app,
        settings,
        consulta=consulta,
        autenticacion=crear_require_service_jwt(verificador),
        recuperacion=recuperacion,
        clock=clock,
        generador=generador,
    )
    app.include_router(
        crear_router_health(
            llm_health or _sonda_llm_segun(settings),
            trace_ids,
            nombres_de_claves(settings),
            VERSION_DEL_SERVICIO,
        )
    )
    return app


def _cargar_modelos_segun(
    settings: Settings, cargador: CargadorDeModelos | None
) -> ModelosDeRecuperacion | None:
    """``MODEL_PROVIDER=local``: verifica los pesos y construye los adapters antes de aceptar tráfico.

    Con ``fake`` no se importa ningún runtime de modelos (``onnxruntime``, ``tokenizers``); el import es diferido.
    """
    if settings.model_provider == "fake":
        return None
    if cargador is None:
        from app.infrastructure.models.local import cargar_modelos_locales

        cargador = cargar_modelos_locales
    return cargador(settings)


def _componer_recuperacion(
    settings: Settings, modelos: ModelosDeRecuperacion | None, corpus: PuertosDelCorpus | None
) -> PuertosDeRecuperacion | None:
    """Modelos reales + corpus (Milvus y catálogo) = los bordes completos; si falta alguno, no hay recuperación."""
    if modelos is None or corpus is None:
        return None
    return PuertosDeRecuperacion(
        detector_idioma=modelos.detector_idioma,
        embedder=modelos.embedder_consulta,
        buscador=corpus.buscador,
        reranker=modelos.reranker,
        lector_release=corpus.lector_release,
        catalogo=corpus.catalogo,
        clasificador_nli=modelos.clasificador_nli,
        verificador_terminos=_cargar_lista_de_terminos(settings),
    )


def _cargar_lista_de_terminos(settings: Settings) -> ProhibitedTermsChecker:
    """La lista versionada de términos prohibidos del catálogo montado (RN-23); sin ella no hay respuesta con evidencia."""
    _exigir_claves({"CLINICAL_CATALOG_PATH": settings.clinical_catalog_path})
    try:
        return cargar_verificador_de_terminos(settings.clinical_catalog_path)  # type: ignore[arg-type]
    except ListaDeTerminosNoDisponible:
        raise ConfiguracionDeRecuperacionIncompleta(
            "CLINICAL_CATALOG_PATH: no contiene lenguaje/terminos-prohibidos.json válido"
        ) from None


def _crear_verificador_jwt_de_servicio(settings: Settings, clock: Clock) -> ServiceJwtVerifier:
    # Fallo cerrado (también con LLM_PROVIDER=fake): sin clave pública legible no hay quien autentique a clinical-api.
    clave_publica = cargar_clave_publica_es256(settings.service_jwt_public_key_file)
    return ServiceJwtVerifier(
        clave_publica,
        clock,
        settings.service_jwt_ttl_seconds,
        settings.service_jwt_clock_skew_seconds,
    )


def _sonda_llm_segun(settings: Settings) -> LlmHealthPort:
    if settings.llm_provider == "fake":
        return FakeLlmHealth()
    return OpenAICompatibleLlmHealth(settings.llm_base_url, settings.llm_health_timeout_ms)


def _registrar_consulta_de_evidencia(
    app: FastAPI,
    settings: Settings,
    *,
    consulta: EvidenceQueryPort | None,
    autenticacion: DependenciaJwtServicio,
    recuperacion: PuertosDeRecuperacion | None,
    clock: Clock,
    generador: EvidenceGenerator | None,
) -> None:
    if consulta is None and settings.llm_provider == "fake":
        consulta = FakeEvidenceQuery.desde_directorio(settings.fake_responses_path)
    elif consulta is None:
        # LLM_PROVIDER=local: la ruta siempre existe. La configuración se exige aunque falten los bordes reales
        # (adapters de embeddings, reranker e idioma, US-231): sin ellos responde 503 fallando cerrado.
        _exigir_configuracion_de_recuperacion(settings)
        consulta = (
            _crear_servicio_de_recuperacion(settings, recuperacion, clock, generador)
            if recuperacion is not None
            else ConsultaNoComponible()
        )
    if consulta is not None:
        app.include_router(crear_router_rag_query(consulta, autenticacion))


def _crear_servicio_de_recuperacion(
    settings: Settings,
    puertos: PuertosDeRecuperacion,
    clock: Clock,
    generador: EvidenceGenerator | None,
) -> RAGOrchestratorService:
    return RAGOrchestratorService(
        detector_idioma=puertos.detector_idioma,
        embedder=puertos.embedder,
        buscador=puertos.buscador,
        reranker=puertos.reranker,
        lector_release=puertos.lector_release,
        catalogo=puertos.catalogo,
        clasificador_nli=puertos.clasificador_nli,
        verificador_terminos=puertos.verificador_terminos,
        # Producción: el LLM local (RN-12). La rama con evidencia ya verifica el soporte NLI y el lenguaje antes de
        # responder (L1D-180, D9 de L1D-275): ninguna opción sin verificar sale de este servicio.
        generador=generador or crear_generador_local(settings),
        reloj=clock,
        parametros=_parametros_de_recuperacion(settings),
    )


def crear_generador_local(settings: Settings) -> LlmEvidenceGenerator:
    """Generación con el LLM nativo local (``LLM_BASE_URL``); sin adapter de nube ni *fallback* (RN-12)."""
    return LlmEvidenceGenerator(
        OpenAICompatibleLlmClient(
            settings.llm_base_url,
            settings.llm_model,
            settings.llm_request_timeout_ms,
            settings.llm_max_output_tokens,
            settings.llm_temperature,
        ),
        settings.details_max_paragraphs,
        settings.llm_fragments_max_chars,
    )


def _exigir_configuracion_de_recuperacion(settings: Settings) -> None:
    """Umbral y tamaños de la recuperación (RN-22): sin valor por defecto en código, el arranque se niega si faltan."""
    _exigir_claves(
        {
            "RELEVANCE_THRESHOLD": settings.relevance_threshold,
            "RETRIEVAL_TOP_K": settings.retrieval_top_k,
            "RERANK_TOP_N": settings.rerank_top_n,
            "NLI_ENTAILMENT_THRESHOLD": settings.nli_entailment_threshold,
        }
    )


def _exigir_claves(valores: dict[str, object]) -> None:
    ausentes = [clave for clave, valor in valores.items() if valor is None]
    if ausentes:
        raise ConfiguracionDeRecuperacionIncompleta(
            f"falta configurar para /rag/query: {', '.join(ausentes)}"
        )


def _proveedor_de_meta(settings: Settings) -> LlmProvider:
    """``LLM_PROVIDER`` (vocabulario de configuración) → ``meta.llmProvider`` (vocabulario del contrato, RN-12).

    Mapeo explícito: ``local`` es el único proveedor con adapter; ``fake`` responde con los ejemplos y nunca llega a la
    recuperación real; ``nube`` entrará aquí cuando exista su adapter.
    """
    if settings.llm_provider == "local":
        return LlmProvider.local
    raise ConfiguracionDeRecuperacionIncompleta(
        "LLM_PROVIDER no tiene un proveedor de meta para la recuperación real"
    )


def _parametros_de_recuperacion(settings: Settings) -> ParametrosDeRecuperacion:
    """Los valores de configuración (RN-22) y la procedencia de ``meta``: ``nliModel`` sale del clasificador y
    ``promptVersion`` del prompt, nunca de una copia en configuración."""
    _exigir_configuracion_de_recuperacion(settings)
    return ParametrosDeRecuperacion(
        relevance_threshold=settings.relevance_threshold,  # type: ignore[arg-type]
        retrieval_top_k=settings.retrieval_top_k,  # type: ignore[arg-type]
        rerank_top_n=settings.rerank_top_n,  # type: ignore[arg-type]
        longitud_maxima_codigo_tipo=settings.retrieval_cancer_type_max_length,
        llm_provider=_proveedor_de_meta(settings),
        llm_model=settings.llm_model,
        nli_entailment_threshold=settings.nli_entailment_threshold,  # type: ignore[arg-type]
        # Con modelos locales el tope sale de ADR-39 (RERANKER_MAX_PAIRS); sin él, el reranker no limita y no se recorta.
        reranker_max_pairs=settings.modelos.reranker_max_pairs if settings.modelos else None,
    )
