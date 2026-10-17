"""`POST /rag/query`: router delgado que delega en `EvidenceQueryPort`."""

from fastapi import APIRouter, Request

from app.api.dependencies.service_jwt import DependenciaJwtServicio, crear_router_interno
from app.application.ports import EvidenceQueryPort
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
    async def rag_query(solicitud: RagQueryInternalRequest, request: Request):
        # Una sola fuente de traceId por petición: el del cuerpo (el mismo X-Trace-Id, TraceId del contrato).
        request.state.trace_id = solicitud.traceId.root
        return await consulta.consultar(solicitud)

    return router
