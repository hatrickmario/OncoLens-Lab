"""Raíz de composición: único lugar que conoce las clases concretas."""

import logging

from fastapi import FastAPI

from app.api.health import crear_router_health
from app.api.rag_query import crear_router_rag_query
from app.application.ports import LlmHealthPort, TraceIdGenerator
from app.config.settings import Settings
from app.infrastructure.fake.fake_evidence_query import FakeEvidenceQuery
from app.infrastructure.fake.sin_sonda_llm import SinSondaLlm
from app.infrastructure.llm.openai_compatible_health import OpenAICompatibleLlmHealth
from app.infrastructure.trace.uuid_trace_id import UuidTraceIdGenerator


def crear_app(
    settings: Settings,
    *,
    llm_health: LlmHealthPort | None = None,
    trace_ids: TraceIdGenerator | None = None,
) -> FastAPI:
    # httpx registra la URL de cada petición en INFO; la del LLM no debe llegar a los logs.
    logging.getLogger("httpx").setLevel(logging.WARNING)
    trace_ids = trace_ids or UuidTraceIdGenerator()
    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)

    if settings.llm_provider == "fake":
        llm_health = llm_health or SinSondaLlm()
        app.include_router(
            crear_router_rag_query(FakeEvidenceQuery.desde_directorio(settings.fake_responses_path))
        )
    else:
        # El enlace real de /rag/query es de L1D-106 (US-055): hasta entonces no se registra.
        llm_health = llm_health or OpenAICompatibleLlmHealth(
            settings.llm_base_url, settings.llm_health_timeout_ms
        )

    app.include_router(crear_router_health(llm_health, trace_ids))
    return app
