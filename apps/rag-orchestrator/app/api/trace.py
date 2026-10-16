"""`traceId` de la petición: el `X-Trace-Id` recibido si cumple el contrato, o uno nuevo."""

from fastapi import Request
from pydantic import ValidationError

from app.application.ports import TraceIdGenerator
from app.schemas.generated.models import TraceId


def resolver_trace_id(request: Request, generador: TraceIdGenerator) -> str:
    recibido = request.headers.get("X-Trace-Id")
    if recibido is not None:
        try:
            return TraceId.model_validate(recibido).root
        except ValidationError:
            pass
    return generador.nuevo()
