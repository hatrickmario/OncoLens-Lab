"""Manejadores de error: `422 CUERPO_INVALIDO` sin eco del cuerpo (RN-10)."""

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.api.trace import resolver_trace_id
from app.application.ports import TraceIdGenerator
from app.schemas.generated.models import DetailItem, ErrorValidacion


def registrar_manejadores_de_error(app: FastAPI, trace_ids: TraceIdGenerator) -> None:
    @app.exception_handler(RequestValidationError)
    async def cuerpo_invalido(request: Request, error: RequestValidationError) -> JSONResponse:
        # Solo loc, msg y type: input y ctx llevan los valores recibidos (contexto clínico desidentificado).
        cuerpo = ErrorValidacion(
            error="CUERPO_INVALIDO",
            message="El cuerpo de la petición no cumple el contrato.",
            traceId=resolver_trace_id(request, trace_ids),
            detail=[DetailItem(loc=list(e["loc"]), msg=e["msg"], type=e["type"]) for e in error.errors()],
        )
        return JSONResponse(status_code=422, content=cuerpo.model_dump())
