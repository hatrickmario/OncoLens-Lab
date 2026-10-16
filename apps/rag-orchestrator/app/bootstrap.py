"""Raíz de composición: único lugar que conoce las clases concretas."""

from fastapi import FastAPI

from app.api.errors import registrar_manejadores_de_error
from app.api.health import crear_router_health
from app.api.rag_query import crear_router_rag_query
from app.application.ports import LlmHealthPort, TraceIdGenerator
from app.config.logging import silenciar_urls_de_httpx_en_logs
from app.config.settings import Settings
from app.infrastructure.fake.fake_evidence_query import FakeEvidenceQuery
from app.infrastructure.fake.fake_llm_health import FakeLlmHealth
from app.infrastructure.llm.openai_compatible_health import OpenAICompatibleLlmHealth
from app.infrastructure.security.clave_publica import cargar_clave_publica_es256
from app.infrastructure.trace.uuid_trace_id import UuidTraceIdGenerator


def crear_app(
    settings: Settings,
    *,
    llm_health: LlmHealthPort | None = None,
    trace_ids: TraceIdGenerator | None = None,
) -> FastAPI:
    silenciar_urls_de_httpx_en_logs()
    # Fallo cerrado (también con LLM_PROVIDER=fake): sin clave pública legible no hay quien autentique a clinical-api.
    cargar_clave_publica_es256(settings.service_jwt_public_key_file)
    trace_ids = trace_ids or UuidTraceIdGenerator()
    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
    registrar_manejadores_de_error(app, trace_ids)
    _registrar_consulta_de_evidencia(app, settings)
    app.include_router(crear_router_health(llm_health or _sonda_llm_segun(settings), trace_ids))
    return app


def _sonda_llm_segun(settings: Settings) -> LlmHealthPort:
    if settings.llm_provider == "fake":
        return FakeLlmHealth()
    return OpenAICompatibleLlmHealth(settings.llm_base_url, settings.llm_health_timeout_ms)


def _registrar_consulta_de_evidencia(app: FastAPI, settings: Settings) -> None:
    # Con LLM_PROVIDER=local el enlace real de /rag/query es de L1D-106 (US-055): hasta entonces no se registra.
    if settings.llm_provider == "fake":
        app.include_router(
            crear_router_rag_query(FakeEvidenceQuery.desde_directorio(settings.fake_responses_path))
        )
