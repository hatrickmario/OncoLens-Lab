"""Middleware ASGI que contiene todo error inesperado: responde un 500 fijo y NO relanza la excepción.

El manejador de ``Exception`` de Starlette responde y después relanza (``ServerErrorMiddleware``): uvicorn escribiría
entonces el traceback con el mensaje del error, que puede traer la pregunta o texto del contexto (RN-10). Este
middleware va por dentro de ``ServerErrorMiddleware`` y por fuera del enrutador, así que ningún error llega más arriba.
Al log solo van la clase del error y el ``traceId``; al cliente, el cuerpo fijo ``ERROR_INTERNO`` del contrato.
"""

import logging

from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

from app.api.trace import resolver_trace_id
from app.application.ports import TraceIdGenerator
from app.schemas.generated.models import ErrorInterno

logger = logging.getLogger(__name__)


class ContencionDeErroresInesperados:
    def __init__(self, app: ASGIApp, trace_ids: TraceIdGenerator) -> None:
        self._app = app
        self._trace_ids = trace_ids

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self._app(scope, receive, send)
            return
        respuesta_iniciada = False

        async def enviar(mensaje: dict) -> None:
            nonlocal respuesta_iniciada
            if mensaje["type"] == "http.response.start":
                respuesta_iniciada = True
            await send(mensaje)

        try:
            await self._app(scope, receive, enviar)
        except Exception as error:  # noqa: BLE001 - nada inesperado sale de la aplicación con su detalle
            await self._responder_error_interno(
                scope, receive, send, error, respuesta_iniciada=respuesta_iniciada
            )

    async def _responder_error_interno(
        self,
        scope: Scope,
        receive: Receive,
        send: Send,
        error: Exception,
        *,
        respuesta_iniciada: bool,
    ) -> None:
        trace_id = resolver_trace_id(Request(scope), self._trace_ids)
        logger.error("event=error_interno clase=%s traceId=%s", type(error).__name__, trace_id)
        if respuesta_iniciada:
            return  # la cabecera ya salió: no se puede cambiar el estado; basta con no relanzar
        cuerpo = ErrorInterno(
            error="ERROR_INTERNO", message="Error interno del servidor.", traceId=trace_id
        )
        respuesta = JSONResponse(status_code=500, content=cuerpo.model_dump())
        await respuesta(scope, receive, send)
