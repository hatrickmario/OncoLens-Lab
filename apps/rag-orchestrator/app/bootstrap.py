"""Raíz de composición: único lugar que conoce las clases concretas."""

from dataclasses import dataclass

from fastapi import FastAPI

from app.api.errors import registrar_manejadores_de_error
from app.api.health import crear_router_health
from app.api.rag_query import crear_router_rag_query
from app.api.dependencies.service_jwt import DependenciaJwtServicio, crear_require_service_jwt
from app.application.ports import (
    ChunkSearch,
    Clock,
    CorpusReleaseReader,
    EvidenceQueryPort,
    LanguageDetector,
    LlmHealthPort,
    QueryEmbedder,
    Reranker,
    TraceIdGenerator,
)
from app.application.consulta_no_componible import ConsultaNoComponible
from app.application.rag_orchestrator_service import (
    ParametrosDeRecuperacion,
    RAGOrchestratorService,
)
from app.config.logging import silenciar_urls_de_httpx_en_logs
from app.config.settings import Settings
from app.infrastructure.clock.system_clock import RelojDelSistema
from app.infrastructure.fake.fake_evidence_query import FakeEvidenceQuery
from app.infrastructure.fake.fake_llm_health import FakeLlmHealth
from app.infrastructure.llm.generador_no_disponible import GeneradorLocalNoDisponible
from app.infrastructure.llm.openai_compatible_health import OpenAICompatibleLlmHealth
from app.infrastructure.security.clave_publica import cargar_clave_publica_es256
from app.infrastructure.security.service_jwt_verifier import ServiceJwtVerifier
from app.infrastructure.trace.uuid_trace_id import UuidTraceIdGenerator


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


def crear_app(
    settings: Settings,
    *,
    llm_health: LlmHealthPort | None = None,
    trace_ids: TraceIdGenerator | None = None,
    clock: Clock | None = None,
    consulta: EvidenceQueryPort | None = None,
    recuperacion: PuertosDeRecuperacion | None = None,
) -> FastAPI:
    silenciar_urls_de_httpx_en_logs()
    trace_ids = trace_ids or UuidTraceIdGenerator()
    clock = clock or RelojDelSistema()
    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
    registrar_manejadores_de_error(app, trace_ids)
    verificador = _crear_verificador_jwt_de_servicio(settings, clock)
    _registrar_consulta_de_evidencia(
        app,
        settings,
        consulta=consulta,
        autenticacion=crear_require_service_jwt(verificador),
        recuperacion=recuperacion,
        clock=clock,
    )
    app.include_router(crear_router_health(llm_health or _sonda_llm_segun(settings), trace_ids))
    return app


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
) -> None:
    if consulta is None and settings.llm_provider == "fake":
        consulta = FakeEvidenceQuery.desde_directorio(settings.fake_responses_path)
    elif consulta is None:
        # LLM_PROVIDER=local: la ruta siempre existe. La configuración se exige aunque falten los bordes reales
        # (adapters de embeddings, reranker e idioma, US-231): sin ellos responde 503 fallando cerrado.
        _exigir_configuracion_de_recuperacion(settings)
        consulta = (
            _crear_servicio_de_recuperacion(settings, recuperacion, clock)
            if recuperacion is not None
            else ConsultaNoComponible()
        )
    if consulta is not None:
        app.include_router(crear_router_rag_query(consulta, autenticacion))


def _crear_servicio_de_recuperacion(
    settings: Settings, puertos: PuertosDeRecuperacion, clock: Clock
) -> RAGOrchestratorService:
    return RAGOrchestratorService(
        detector_idioma=puertos.detector_idioma,
        embedder=puertos.embedder,
        buscador=puertos.buscador,
        reranker=puertos.reranker,
        lector_release=puertos.lector_release,
        # Hasta L1D-275 (US-225) la rama con evidencia responde 503 LOCAL_LLM_UNAVAILABLE.
        generador=GeneradorLocalNoDisponible(),
        reloj=clock,
        parametros=_parametros_de_recuperacion(settings),
    )


def _exigir_configuracion_de_recuperacion(settings: Settings) -> None:
    """Umbral y tamaños de la recuperación (RN-22): sin valor por defecto en código, el arranque se niega si faltan."""
    _exigir_claves(
        {
            "RELEVANCE_THRESHOLD": settings.relevance_threshold,
            "RETRIEVAL_TOP_K": settings.retrieval_top_k,
            "RERANK_TOP_N": settings.rerank_top_n,
        }
    )


def _exigir_claves(valores: dict[str, object]) -> None:
    ausentes = [clave for clave, valor in valores.items() if valor is None]
    if ausentes:
        raise ConfiguracionDeRecuperacionIncompleta(
            f"falta configurar para /rag/query: {', '.join(ausentes)}"
        )


def _parametros_de_recuperacion(settings: Settings) -> ParametrosDeRecuperacion:
    """Además de la configuración de recuperación, las etiquetas de ``meta`` (NLI_MODEL, PROMPT_VERSION)."""
    _exigir_configuracion_de_recuperacion(settings)
    _exigir_claves({"NLI_MODEL": settings.nli_model, "PROMPT_VERSION": settings.prompt_version})
    return ParametrosDeRecuperacion(
        relevance_threshold=settings.relevance_threshold,  # type: ignore[arg-type]
        retrieval_top_k=settings.retrieval_top_k,  # type: ignore[arg-type]
        rerank_top_n=settings.rerank_top_n,  # type: ignore[arg-type]
        llm_provider=settings.llm_provider,
        llm_model=settings.llm_model,
        nli_model=settings.nli_model,  # type: ignore[arg-type]
        prompt_version=settings.prompt_version,  # type: ignore[arg-type]
    )
