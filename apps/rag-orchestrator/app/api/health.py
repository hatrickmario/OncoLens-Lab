"""`GET /health`: estado del proceso y del LLM nativo (US-034)."""

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from app.api.trace import resolver_trace_id
from app.application.ports import LlmHealthPort, TraceIdGenerator
from app.schemas.generated.models import ErrorLlmLocalNoDisponible, HealthStatus


def crear_router_health(
    llm_health: LlmHealthPort,
    trace_ids: TraceIdGenerator,
    config_keys: list[str],
    service_version: str,
) -> APIRouter:
    """``config_keys`` son solo nombres de variables, ya ordenados: `/health` nunca expone un valor (RN-14, RN-22)."""
    router = APIRouter(tags=["operacion"])

    @router.get(
        "/health",
        response_model=HealthStatus,
        responses={503: {"model": ErrorLlmLocalNoDisponible}},
    )
    async def health(request: Request):
        if await llm_health.esta_disponible():
            return HealthStatus(status="ok", configKeys=config_keys, serviceVersion=service_version)
        error = ErrorLlmLocalNoDisponible(
            error="LOCAL_LLM_UNAVAILABLE",
            message="El modelo local no está disponible.",
            traceId=resolver_trace_id(request, trace_ids),
        )
        return JSONResponse(status_code=503, content=error.model_dump())

    return router
