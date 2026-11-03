"""`ResponderSeguimiento`: caso de uso de `/rag/follow-up` sobre el pipeline del análisis (US-218, design D6)."""

from __future__ import annotations

from collections.abc import Mapping

from app.application.ports import SeguimientoGenerator
from app.application.rag_orchestrator_service import RAGOrchestratorService
from app.schemas.generated.models import RagFollowUpRequest, RagFollowUpResponse


class ResponderSeguimiento:
    def __init__(
        self,
        *,
        servicio: RAGOrchestratorService,
        generador: SeguimientoGenerator,
        terminos_por_tipo: Mapping[str, frozenset[str]],
    ) -> None:
        self._servicio = servicio
        self._generador = generador
        self._terminos_por_tipo = terminos_por_tipo

    async def responder(self, solicitud: RagFollowUpRequest) -> RagFollowUpResponse:
        raise NotImplementedError("no implementado")
