"""`ChatTurnService`: caso de uso de `/chat/turn` (US-259, ADR-51)."""

from __future__ import annotations

from collections.abc import Mapping

from app.application.chat.registro_de_hilos import RegistroDeHilos
from app.application.ports import CatalogoClinico, Clock, ContadorDeTokens, LlmClient
from app.config.settings import Settings
from app.schemas.generated.models import ChatTurnRequest, ChatTurnResponse


class ChatTurnService:
    def __init__(
        self,
        *,
        llm: LlmClient,
        catalogo: CatalogoClinico,
        contador: ContadorDeTokens,
        reloj: Clock,
        settings: Settings,
        terminos_por_tipo: Mapping[str, frozenset[str]],
    ) -> None:
        self._llm = llm
        self.registro = RegistroDeHilos(
            reloj=reloj,
            ttl_segundos=settings.chat_thread_ttl_seconds,
            max_hilos=settings.chat_max_threads,
        )

    async def turno(self, solicitud: ChatTurnRequest) -> ChatTurnResponse:
        raise NotImplementedError("no implementado")
