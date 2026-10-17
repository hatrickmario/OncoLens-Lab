"""Generador provisional de `/rag/query` con `LLM_PROVIDER=local` (US-055) hasta que L1D-275 (US-225) lo reemplace."""

from app.application.errores import LlmLocalNoDisponibleError
from app.application.ports import ResultadoDeRecuperacion
from app.schemas.generated.models import RagQueryInternalRequest, RagQueryInternalResponse


class GeneradorLocalNoDisponible:
    """Implementa `EvidenceGenerator`: la generación real aún no existe, así que falla cerrada con `503`.

    Devolver `sin_evidencia` con chunks sobre el umbral mentiría (RN-02); un `con_evidencia` incompleto no validaría
    contra el esquema. Nunca invoca un modelo ni responde con contenido.
    """

    async def generar(
        self, solicitud: RagQueryInternalRequest, recuperacion: ResultadoDeRecuperacion
    ) -> RagQueryInternalResponse:
        raise LlmLocalNoDisponibleError()
