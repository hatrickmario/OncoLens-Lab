"""`POST /rag/query`: router delgado que delega en `EvidenceQueryPort`."""

from fastapi import APIRouter, Depends

from app.api.dependencies.service_jwt import DependenciaJwtServicio
from app.application.ports import EvidenceQueryPort
from app.schemas.generated.models import RagQueryInternalRequest, RagQueryInternalResponse


def crear_router_rag_query(consulta: EvidenceQueryPort, autenticacion: DependenciaJwtServicio) -> APIRouter:
    # La autenticación es una dependencia del router: se resuelve antes que el cuerpo y cubre todo endpoint interno.
    router = APIRouter(tags=["rag"], dependencies=[Depends(autenticacion)])

    # exclude_unset: la respuesta del modo fake sale literal, tal como está en el ejemplo.
    @router.post("/rag/query", response_model=RagQueryInternalResponse, response_model_exclude_unset=True)
    async def rag_query(solicitud: RagQueryInternalRequest):
        return await consulta.consultar(solicitud)

    return router
