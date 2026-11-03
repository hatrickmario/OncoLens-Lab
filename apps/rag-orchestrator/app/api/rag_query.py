"""`POST /rag/query`: router delgado que delega en `EvidenceQueryPort`."""

from fastapi import APIRouter
from fastapi.exceptions import RequestValidationError

from app.api.dependencies.service_jwt import DependenciaJwtServicio, crear_router_interno
from app.api.trace import fijar_trace_id
from app.application.ports import EvidenceQueryPort
from app.domain.pregunta import normalizar_pregunta
from app.schemas.generated.models import RagQueryInternalRequest, RagQueryInternalResponse


def crear_router_rag_query(
    consulta: EvidenceQueryPort, autenticacion: DependenciaJwtServicio
) -> APIRouter:
    # La autenticación es del router interno: corre antes que el cuerpo y cubre todo endpoint que se le añada.
    router = crear_router_interno(autenticacion, tags=["rag"])

    # exclude_unset: la respuesta del modo fake sale literal, tal como está en el ejemplo.
    @router.post(
        "/rag/query", response_model=RagQueryInternalResponse, response_model_exclude_unset=True
    )
    async def rag_query(solicitud: RagQueryInternalRequest):
        # Una sola fuente de traceId por petición: el del cuerpo (el mismo X-Trace-Id, TraceId del contrato).
        fijar_trace_id(solicitud.traceId.root)
        # US-250: todas las etapas ven la pregunta en NFC; vacía tras normalizar es el mismo 422 del contrato (sin eco).
        pregunta = normalizar_pregunta(solicitud.query)
        if not pregunta:
            raise RequestValidationError(
                [
                    {
                        "loc": ("body", "query"),
                        "msg": "La pregunta está vacía.",
                        "type": "value_error",
                    }
                ]
            )
        return await consulta.consultar(solicitud.model_copy(update={"query": pregunta}))

    return router
