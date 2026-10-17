"""``IdGenerator`` de producción: identificadores aleatorios; los tests inyectan uno congelado."""

from __future__ import annotations

import uuid


class UuidIdGenerator:
    def __init__(self, prefijo: str) -> None:
        self._prefijo = prefijo

    def nuevo(self) -> str:
        return f"{self._prefijo}-{uuid.uuid4().hex[:12]}"
