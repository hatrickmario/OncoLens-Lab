"""Raíz de composición: único lugar que conoce las clases concretas."""

import logging

from fastapi import FastAPI

from app.api.health import crear_router_health
from app.application.ports import LlmHealthPort, TraceIdGenerator
from app.config.settings import Settings
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
    llm_health = llm_health or OpenAICompatibleLlmHealth(
        settings.llm_base_url, settings.llm_health_timeout_ms
    )
    trace_ids = trace_ids or UuidTraceIdGenerator()

    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
    app.include_router(crear_router_health(llm_health, trace_ids))
    return app
