"""Fakes de los puertos para los tests: cumplen el mismo contrato que los adapters reales."""

from app.config.settings import Settings


class GeneradorTraceFijo:
    """`TraceIdGenerator` congelado: siempre el mismo `traceId` válido."""

    def __init__(self, valor: str = "req_00000001") -> None:
        self.valor = valor

    def nuevo(self) -> str:
        return self.valor


def settings_de_prueba(**cambios: object) -> Settings:
    """Settings sin leer el entorno ni archivos `.env` de la máquina."""
    return Settings(_env_file=None, **cambios)  # type: ignore[call-arg, arg-type]
