"""`traceId` de la petición: el `X-Trace-Id` recibido si cumple el contrato, o uno nuevo.

El middleware lo resuelve una sola vez por request y lo deja en un `ContextVar`: así todas las líneas de log de la
request (y los errores que se responden) comparten el mismo `traceId` (US-037 AC-4, NFR-10).
"""

from contextvars import ContextVar

from fastapi import Request
from pydantic import ValidationError
from starlette.types import ASGIApp, Receive, Scope, Send

from app.application.ports import TraceIdGenerator
from app.schemas.generated.models import TraceId

_trace_id_de_la_request: ContextVar[str | None] = ContextVar("trace_id_de_la_request", default=None)


def trace_id_actual() -> str | None:
    return _trace_id_de_la_request.get()


def fijar_trace_id(valor: str) -> None:
    """Para el endpoint que lee el cuerpo ya validado: su `traceId` pasa a ser el de los logs de esa request."""
    _trace_id_de_la_request.set(valor)


def _trace_id_de_la_cabecera(request: Request) -> str | None:
    recibido = request.headers.get("X-Trace-Id")
    if recibido is None:
        return None
    try:
        return TraceId.model_validate(recibido).root
    except ValidationError:
        return None


def resolver_trace_id(request: Request, generador: TraceIdGenerator) -> str:
    # El ContextVar lo fija el middleware (cabecera o generado) y el endpoint lo reemplaza por el del cuerpo validado.
    return trace_id_actual() or _trace_id_de_la_cabecera(request) or generador.nuevo()


class ContextoDeTraceId:
    """Middleware ASGI más externo: fija el `traceId` de la request para el logging y los manejadores de error."""

    def __init__(self, app: ASGIApp, trace_ids: TraceIdGenerator) -> None:
        self._app = app
        self._trace_ids = trace_ids

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self._app(scope, receive, send)
            return
        trace_id = _trace_id_de_la_cabecera(Request(scope)) or self._trace_ids.nuevo()
        marca = _trace_id_de_la_request.set(trace_id)
        try:
            await self._app(scope, receive, send)
        finally:
            _trace_id_de_la_request.reset(marca)
