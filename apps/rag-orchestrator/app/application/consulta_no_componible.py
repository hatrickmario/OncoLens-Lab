"""`EvidenceQueryPort` de `LLM_PROVIDER=local` cuando faltan los bordes reales de la recuperación (US-055)."""

from app.application.errores import LlmLocalNoDisponibleError, RecuperacionNoDisponibleError
from app.schemas.generated.models import (
    ChatTurnRequest,
    ChatTurnResponse,
    RagFollowUpRequest,
    RagFollowUpResponse,
    RagQueryInternalRequest,
    RagQueryInternalResponse,
)


class ConsultaNoComponible:
    """Responde `503 RETRIEVAL_UNAVAILABLE` (etapa ``composicion``) hasta que existan los adapters reales (US-231).

    Falla cerrado: nunca inventa evidencia ni devuelve un ``sin_evidencia`` que parezca una búsqueda hecha.
    """

    async def consultar(self, solicitud: RagQueryInternalRequest) -> RagQueryInternalResponse:
        raise RecuperacionNoDisponibleError("composicion")


class ChatNoComponible:
    """`ChatTurnPort` análogo: sin los términos del catálogo, `/chat/turn` falla cerrado.

    El contrato de `/chat/turn` solo admite 503 ``LOCAL_LLM_UNAVAILABLE`` o ``LLM_OUTPUT_INVALID``: el chat sin componer es,
    para Backend 1, un chat sin modelo disponible."""

    async def turno(self, solicitud: ChatTurnRequest) -> ChatTurnResponse:
        raise LlmLocalNoDisponibleError()


class SeguimientoNoComponible:
    """`FollowUpPort` análogo: sin los bordes reales de la recuperación, `/rag/follow-up` falla cerrado (503)."""

    async def responder(self, solicitud: RagFollowUpRequest) -> RagFollowUpResponse:
        raise RecuperacionNoDisponibleError("composicion")
