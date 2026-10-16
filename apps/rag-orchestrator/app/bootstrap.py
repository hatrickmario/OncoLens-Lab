"""Raíz de composición: único lugar que conoce las clases concretas."""

from fastapi import FastAPI

from app.application.ports import LlmHealthPort, TraceIdGenerator
from app.config.settings import Settings


def crear_app(
    settings: Settings,
    *,
    llm_health: LlmHealthPort | None = None,
    trace_ids: TraceIdGenerator | None = None,
) -> FastAPI:
    return FastAPI()
