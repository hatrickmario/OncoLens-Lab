"""`traceId` de la petición: el `X-Trace-Id` recibido si es válido, o uno nuevo."""

from fastapi import Request

from app.application.ports import TraceIdGenerator
from app.domain.trace_id import es_trace_id_valido


def resolver_trace_id(request: Request, generador: TraceIdGenerator) -> str:
    recibido = request.headers.get("X-Trace-Id")
    if recibido is not None and es_trace_id_valido(recibido):
        return recibido
    return generador.nuevo()
