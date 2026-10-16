"""Puertos de la capa de aplicación. Cada change de rag-orchestrator añade aquí los suyos."""

from datetime import datetime
from typing import Protocol

from app.schemas.generated.models import RagQueryInternalRequest, RagQueryInternalResponse


class LlmHealthPort(Protocol):
    """Sonda del LLM nativo: `True` si responde, `False` si no (conexión, timeout o 5xx)."""

    async def esta_disponible(self) -> bool: ...


class EvidenceQueryPort(Protocol):
    """Consulta de evidencia de `/rag/query`; el enlace real es de L1D-106, el `fake` de L1D-164."""

    async def consultar(self, solicitud: RagQueryInternalRequest) -> RagQueryInternalResponse: ...


class TraceIdGenerator(Protocol):
    """Genera `traceId` (`req_` + 8–32 alfanuméricos); inyectado para que los tests lo congelen."""

    def nuevo(self) -> str: ...


class Clock(Protocol):
    """Reloj inyectado (UTC): los tests lo congelan; nada de `time.time()` directo en dominio ni servicios."""

    def ahora(self) -> datetime: ...


class ServiceTokenVerifierPort(Protocol):
    """Verifica el JWT de servicio de `clinical-api`; lanza `TokenServicioInvalido(motivo)` si no es válido."""

    def verificar(self, token: str | None) -> None: ...
