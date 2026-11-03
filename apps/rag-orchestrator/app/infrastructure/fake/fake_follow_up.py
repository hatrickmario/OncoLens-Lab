"""Modo `LLM_PROVIDER=fake` del seguimiento (US-034 AC-6): la respuesta fija de `contracts/examples/rag-follow-up-response.json`."""

from pathlib import Path

from pydantic import ValidationError

from app.infrastructure.fake.fake_evidence_query import EjemploFixtureInvalido
from app.schemas.generated.models import RagFollowUpRequest, RagFollowUpResponse

_ARCHIVO = "rag-follow-up-response.json"


class FakeFollowUp:
    """Implementa `FollowUpPort` sin recuperación ni LLM; nunca inventa evidencia: devuelve el ejemplo del contrato."""

    def __init__(self, respuesta: RagFollowUpResponse) -> None:
        self._respuesta = respuesta

    @classmethod
    def desde_directorio(cls, directorio: Path) -> "FakeFollowUp":
        try:
            return cls(
                RagFollowUpResponse.model_validate_json(
                    (directorio / _ARCHIVO).read_text(encoding="utf-8")
                )
            )
        except (OSError, ValidationError):
            raise EjemploFixtureInvalido(
                f"{_ARCHIVO} falta o no cumple RagFollowUpResponse"
            ) from None

    async def responder(self, solicitud: RagFollowUpRequest) -> RagFollowUpResponse:
        return self._respuesta
