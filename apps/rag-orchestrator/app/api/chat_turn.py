"""`POST /chat/turn`: router delgado que delega en `ChatTurnPort` (US-259, ADR-51)."""

from fastapi import APIRouter

from app.api.dependencies.service_jwt import DependenciaJwtServicio, crear_router_interno
from app.api.pregunta_normalizada import pregunta_normalizada_o_422
from app.api.trace import fijar_trace_id
from app.application.ports import ChatTurnPort
from app.schemas.generated.models import ChatTurnRequest, ChatTurnResponse


def crear_router_chat_turn(turno: ChatTurnPort, autenticacion: DependenciaJwtServicio) -> APIRouter:
    router = crear_router_interno(autenticacion, tags=["rag"])

    @router.post("/chat/turn", response_model=ChatTurnResponse, response_model_exclude_unset=True)
    async def chat_turn(solicitud: ChatTurnRequest):
        fijar_trace_id(solicitud.traceId.root)
        pregunta = pregunta_normalizada_o_422(solicitud.question, "question")
        return await turno.turno(solicitud.model_copy(update={"question": pregunta}))

    return router
