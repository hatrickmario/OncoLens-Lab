"""`RegistroDeHilos`: estado efímero de los hilos del chat en memoria del proceso (US-259, ADR-51, design D2)."""

from __future__ import annotations

from typing import Any

from app.application.ports import Clock


class RegistroDeHilos:
    def __init__(self, *, reloj: Clock, ttl_segundos: int, max_hilos: int) -> None:
        pass

    def estado_para_inspeccion(self, thread_id: str) -> dict[str, Any] | None:
        raise NotImplementedError("no implementado")
