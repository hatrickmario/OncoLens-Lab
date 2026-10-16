"""Reloj de producción; los tests inyectan uno congelado."""

from datetime import datetime, timezone


class RelojDelSistema:
    def ahora(self) -> datetime:
        return datetime.now(timezone.utc)
