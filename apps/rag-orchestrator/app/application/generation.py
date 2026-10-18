"""Generación de la rama con evidencia de `/rag/query` (US-225): prompt → LLM local → opciones crudas."""

from __future__ import annotations

from app.application.ports import EvidenciaGenerada, LlmClient, ResultadoDeRecuperacion
from app.schemas.generated.models import RagQueryInternalRequest


class LlmEvidenceGenerator:
    """Implementa ``EvidenceGenerator`` sobre el puerto ``LlmClient``."""

    def __init__(self, cliente: LlmClient) -> None:
        self._cliente = cliente

    async def generar(
        self, solicitud: RagQueryInternalRequest, recuperacion: ResultadoDeRecuperacion
    ) -> EvidenciaGenerada:
        raise NotImplementedError("no implementado")
