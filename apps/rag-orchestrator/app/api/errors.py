"""Manejadores de error: `422 CUERPO_INVALIDO` sin eco de la petición (RN-10).

Cubre todo `RequestValidationError` (body, header, query y path). La autenticación (L1D-105)
lanza 401 desde una dependencia, nunca con un `Header()` obligatorio: ese caso terminaría aquí como 422.
También traduce `TokenServicioInvalido` a `401 TOKEN_SERVICIO_INVALIDO` y los errores de aplicación de la
recuperación (US-055) a `503 RETRIEVAL_UNAVAILABLE`, `503 LOCAL_LLM_UNAVAILABLE`, `503 NLI_UNAVAILABLE` y `422 TIPO_CANCER_NO_REGISTRADO`
`TipoNoHabilitadoError` (RN-20) a `422 TIPO_NO_HABILITADO` y `CatalogVersionMismatchError` (NFR-14) a `409 CATALOG_VERSION_MISMATCH`, todos con mensaje fijo y sin eco de la petición. El 500 de lo inesperado NO se maneja aquí: lo responde sin relanzar
`ContencionDeErroresInesperados` (un manejador de `Exception` relanza y uvicorn escribiría el traceback).
"""

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.api.trace import resolver_trace_id
from app.application.errores import (
    LlmLocalNoDisponibleError,
    NliNoDisponibleError,
    RecuperacionNoDisponibleError,
    TipoCancerNoRegistradoError,
)
from app.application.ports import TraceIdGenerator
from app.domain.catalogo import CatalogVersionMismatchError
from app.domain.tipos_habilitados import TipoNoHabilitadoError
from app.domain.token_servicio import TokenServicioInvalido
from app.schemas.generated.models import (
    DetailItem,
    ErrorCatalogVersionMismatch,
    ErrorLlmLocalNoDisponible,
    ErrorNliNoDisponible,
    ErrorRecuperacionNoDisponible,
    ErrorTipoCancerNoRegistrado,
    ErrorTipoNoHabilitado,
    ErrorTokenServicioInvalido,
    ErrorValidacion,
)

logger = logging.getLogger(__name__)


def registrar_manejadores_de_error(app: FastAPI, trace_ids: TraceIdGenerator) -> None:
    @app.exception_handler(RequestValidationError)
    async def peticion_invalida_sin_eco(
        request: Request, error: RequestValidationError
    ) -> JSONResponse:
        """Responde 422 a cualquier `RequestValidationError` (body, header, query o path) sin eco de los valores."""
        # Solo loc, msg y type: input y ctx llevan los valores recibidos (contexto clínico desidentificado).
        cuerpo = ErrorValidacion(
            error="CUERPO_INVALIDO",
            message="El cuerpo de la petición no cumple el contrato.",
            traceId=resolver_trace_id(request, trace_ids),
            detail=[
                DetailItem(loc=list(e["loc"]), msg=e["msg"], type=e["type"]) for e in error.errors()
            ],
        )
        return JSONResponse(status_code=422, content=cuerpo.model_dump())

    @app.exception_handler(RecuperacionNoDisponibleError)
    async def recuperacion_no_disponible(
        request: Request, error: RecuperacionNoDisponibleError
    ) -> JSONResponse:
        """503 RETRIEVAL_UNAVAILABLE: mensaje fijo, sin eco de la pregunta ni detalle del motor (falla cerrada)."""
        trace_id = resolver_trace_id(request, trace_ids)
        logger.warning("event=retrieval_unavailable etapa=%s traceId=%s", error.etapa, trace_id)
        cuerpo = ErrorRecuperacionNoDisponible(
            error="RETRIEVAL_UNAVAILABLE",
            message="La recuperación de evidencia no está disponible.",
            traceId=trace_id,
        )
        return JSONResponse(status_code=503, content=cuerpo.model_dump())

    @app.exception_handler(LlmLocalNoDisponibleError)
    async def llm_local_no_disponible(
        request: Request, error: LlmLocalNoDisponibleError
    ) -> JSONResponse:
        """503 LOCAL_LLM_UNAVAILABLE: con datos reales no hay fallback a la nube (RN-12)."""
        trace_id = resolver_trace_id(request, trace_ids)
        logger.warning("event=local_llm_unavailable traceId=%s", trace_id)
        cuerpo = ErrorLlmLocalNoDisponible(
            error="LOCAL_LLM_UNAVAILABLE",
            message="El modelo local no está disponible.",
            traceId=trace_id,
        )
        return JSONResponse(status_code=503, content=cuerpo.model_dump())

    @app.exception_handler(NliNoDisponibleError)
    async def nli_no_disponible(request: Request, error: NliNoDisponibleError) -> JSONResponse:
        """503 NLI_UNAVAILABLE: falla cerrada, ninguna opción sale sin verificar (RN-01); sin eco ni detalle del modelo."""
        trace_id = resolver_trace_id(request, trace_ids)
        logger.warning("event=nli_unavailable traceId=%s", trace_id)
        cuerpo = ErrorNliNoDisponible(
            error="NLI_UNAVAILABLE",
            message="El verificador de soporte no está disponible.",
            traceId=trace_id,
        )
        return JSONResponse(status_code=503, content=cuerpo.model_dump())

    @app.exception_handler(TipoCancerNoRegistradoError)
    async def tipo_cancer_no_registrado(
        request: Request, error: TipoCancerNoRegistradoError
    ) -> JSONResponse:
        """422 TIPO_CANCER_NO_REGISTRADO: no es un `sin_evidencia`; sin tipo no hay filtro de recuperación."""
        cuerpo = ErrorTipoCancerNoRegistrado(
            error="TIPO_CANCER_NO_REGISTRADO",
            message="El contexto no tiene tipo de cáncer; no es posible filtrar la evidencia.",
            traceId=resolver_trace_id(request, trace_ids),
        )
        return JSONResponse(status_code=422, content=cuerpo.model_dump())

    @app.exception_handler(TipoNoHabilitadoError)
    async def tipo_no_habilitado(request: Request, error: TipoNoHabilitadoError) -> JSONResponse:
        """422 TIPO_NO_HABILITADO (RN-20): mensaje fijo, sin eco del tipo ni de la pregunta (RN-10)."""
        cuerpo = ErrorTipoNoHabilitado(
            error="TIPO_NO_HABILITADO",
            message="El tipo de cáncer no está habilitado en este entorno.",
            traceId=resolver_trace_id(request, trace_ids),
        )
        return JSONResponse(status_code=422, content=cuerpo.model_dump())

    @app.exception_handler(CatalogVersionMismatchError)
    async def catalogo_de_otra_version(
        request: Request, error: CatalogVersionMismatchError
    ) -> JSONResponse:
        """409 CATALOG_VERSION_MISMATCH: mensaje fijo; ninguna de las dos versiones sale en la respuesta (RN-10)."""
        cuerpo = ErrorCatalogVersionMismatch(
            error="CATALOG_VERSION_MISMATCH",
            message="La versión del catálogo difiere de la cargada.",
            traceId=resolver_trace_id(request, trace_ids),
        )
        return JSONResponse(status_code=409, content=cuerpo.model_dump())

    @app.exception_handler(TokenServicioInvalido)
    async def token_servicio_invalido(
        request: Request, error: TokenServicioInvalido
    ) -> JSONResponse:
        """Responde 401 con cuerpo y mensaje fijos para todo motivo (sin oráculo); el motivo solo va al log."""
        trace_id = resolver_trace_id(request, trace_ids)
        # Nunca el token, la cabecera Authorization ni la cookie: solo evento, motivo cerrado y traceId.
        logger.warning("event=token_servicio_invalido motivo=%s traceId=%s", error.motivo, trace_id)
        cuerpo = ErrorTokenServicioInvalido(
            error="TOKEN_SERVICIO_INVALIDO",
            message="El token de servicio falta o no es válido.",
            traceId=trace_id,
        )
        return JSONResponse(
            status_code=401, content=cuerpo.model_dump(), headers={"WWW-Authenticate": "Bearer"}
        )
