"""Manejadores de error: `422 CUERPO_INVALIDO` sin eco de la petición (RN-10).

Cubre todo `RequestValidationError` (body, header, query y path). La autenticación (L1D-105)
debe lanzar 401 desde una dependencia, nunca con un `Header()` obligatorio: ese caso
terminaría aquí como 422.
"""

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.api.trace import resolver_trace_id
from app.application.ports import TraceIdGenerator
from app.schemas.generated.models import DetailItem, ErrorValidacion


def registrar_manejadores_de_error(app: FastAPI, trace_ids: TraceIdGenerator) -> None:
    @app.exception_handler(RequestValidationError)
    async def peticion_invalida_sin_eco(request: Request, error: RequestValidationError) -> JSONResponse:
        """Responde 422 a cualquier `RequestValidationError` (body, header, query o path) sin eco de los valores."""
        # Solo loc, msg y type: input y ctx llevan los valores recibidos (contexto clínico desidentificado).
        cuerpo = ErrorValidacion(
            error="CUERPO_INVALIDO",
            message="El cuerpo de la petición no cumple el contrato.",
            traceId=resolver_trace_id(request, trace_ids),
            detail=[DetailItem(loc=list(e["loc"]), msg=e["msg"], type=e["type"]) for e in error.errors()],
        )
        return JSONResponse(status_code=422, content=cuerpo.model_dump())
