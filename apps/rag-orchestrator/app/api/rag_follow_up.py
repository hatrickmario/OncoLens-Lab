"""`POST /rag/follow-up`: router delgado que delega en `FollowUpPort` (US-218)."""

from fastapi import APIRouter

from app.api.dependencies.service_jwt import DependenciaJwtServicio, crear_router_interno
from app.api.pregunta_normalizada import pregunta_normalizada_o_422
from app.api.trace import fijar_trace_id
from app.application.ports import FollowUpPort
from app.schemas.generated.models import RagFollowUpRequest, RagFollowUpResponse


def crear_router_rag_follow_up(
    seguimiento: FollowUpPort, autenticacion: DependenciaJwtServicio
) -> APIRouter:
    router = crear_router_interno(autenticacion, tags=["rag"])

    @router.post(
        "/rag/follow-up", response_model=RagFollowUpResponse, response_model_exclude_unset=True
    )
    async def rag_follow_up(solicitud: RagFollowUpRequest):
        fijar_trace_id(solicitud.traceId.root)
        pregunta = pregunta_normalizada_o_422(solicitud.question, "question")
        return await seguimiento.responder(solicitud.model_copy(update={"question": pregunta}))

    return router
