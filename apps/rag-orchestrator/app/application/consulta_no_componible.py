"""`EvidenceQueryPort` de `LLM_PROVIDER=local` cuando faltan los bordes reales de la recuperación (US-055)."""

from app.application.errores import RecuperacionNoDisponibleError
from app.schemas.generated.models import RagQueryInternalRequest, RagQueryInternalResponse


class ConsultaNoComponible:
    """Responde `503 RETRIEVAL_UNAVAILABLE` (etapa ``composicion``) hasta que existan los adapters reales (US-231).

    Falla cerrado: nunca inventa evidencia ni devuelve un ``sin_evidencia`` que parezca una búsqueda hecha.
    """

    async def consultar(self, solicitud: RagQueryInternalRequest) -> RagQueryInternalResponse:
        raise RecuperacionNoDisponibleError("composicion")
