"""Adapter de ``CriteriosDeAplicabilidad`` sobre ``aplicabilidad.json`` del catálogo montado (L1D-126, D4)."""

from pathlib import Path

from app.domain.criterios_aplicabilidad import CriterioDeAplicabilidad


class CriteriosDelCatalogo:
    """Implementa ``CriteriosDeAplicabilidad`` sobre criterios ya leídos."""

    def __init__(self, por_tipo: dict[str, tuple[CriterioDeAplicabilidad, ...]]) -> None:
        raise NotImplementedError("no implementado")

    def criterios(self, tipo_de_cancer: str) -> tuple[CriterioDeAplicabilidad, ...]:
        raise NotImplementedError("no implementado")


def cargar_criterios_de_aplicabilidad(
    catalogos: Path, tipos_de_cancer: tuple[str, ...]
) -> CriteriosDelCatalogo:
    """Lee una vez ``<catálogos>/<tipo>/aplicabilidad.json`` de cada tipo del manifiesto."""
    raise NotImplementedError("no implementado")
