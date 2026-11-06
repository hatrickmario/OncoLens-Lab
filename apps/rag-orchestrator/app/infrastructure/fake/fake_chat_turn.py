"""Modo `LLM_PROVIDER=fake` del chat (US-034 AC-6): la respuesta fija de `contracts/examples/chat-turn-caso-ok.json`."""

from pathlib import Path

from pydantic import ValidationError

from app.application.chat.registro_de_hilos import RegistroDeHilos
from app.infrastructure.fake.fake_evidence_query import EjemploFixtureInvalido
from app.schemas.generated.models import ChatTurnRequest, ChatTurnResponse

_ARCHIVO = "chat-turn-caso-ok.json"


class FakeChatTurn:
    """Implementa `ChatTurnPort` sin grafo ni LLM; nunca inventa contenido: devuelve el ejemplo del contrato.

    Admite los turnos por el MISMO ``RegistroDeHilos`` que el servicio real (TTL, desalojo y 404 de hilo desconocido), de
    modo que Backend 1 y el E2E ven la misma conducta de hilos con y sin LLM."""

    def __init__(self, respuesta: ChatTurnResponse, registro: RegistroDeHilos) -> None:
        self._respuesta = respuesta
        self._registro = registro

    @classmethod
    def desde_directorio(cls, directorio: Path, registro: RegistroDeHilos) -> "FakeChatTurn":
        try:
            return cls(
                ChatTurnResponse.model_validate_json(
                    (directorio / _ARCHIVO).read_text(encoding="utf-8")
                ),
                registro,
            )
        except (OSError, ValidationError):
            raise EjemploFixtureInvalido(f"{_ARCHIVO} falta o no cumple ChatTurnResponse") from None

    async def turno(self, solicitud: ChatTurnRequest) -> ChatTurnResponse:
        self._registro.admitir_turno(
            solicitud.threadId, con_rehidratacion=solicitud.rehydration is not None
        )
        return self._respuesta
