"""Generador de `traceId` en producción; los tests inyectan uno congelado."""

from uuid import uuid4


class UuidTraceIdGenerator:
    def nuevo(self) -> str:
        return f"req_{uuid4().hex[:16]}"
