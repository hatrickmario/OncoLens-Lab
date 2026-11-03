"""Generación del seguimiento (US-218): prompt de seguimiento → LLM local → afirmaciones crudas."""

from __future__ import annotations

from app.application.ports import LlmClient, ResultadoDeRecuperacion, SeguimientoGenerado
from app.schemas.generated.models import RagFollowUpRequest


class LlmSeguimientoGenerator:
    """Implementa ``SeguimientoGenerator`` sobre el puerto ``LlmClient``."""

    def __init__(
        self,
        cliente: LlmClient,
        *,
        claims_min: int,
        claims_max: int,
        claim_max_words: int,
        max_chars_fragmentos: int = 12000,
    ) -> None:
        self._cliente = cliente

    async def generar(
        self, solicitud: RagFollowUpRequest, recuperacion: ResultadoDeRecuperacion
    ) -> SeguimientoGenerado:
        raise NotImplementedError("no implementado")
