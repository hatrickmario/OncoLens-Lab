"""Adapter de ``CatalogoClinico``: la versión sale de ``manifest.json`` del catálogo montado (US-041, D1 y D4)."""

from pathlib import Path


class CatalogoNoDisponible(RuntimeError):
    """``manifest.json`` falta, no se puede leer o no declara una versión. El mensaje nunca lleva la ruta."""


class CatalogoDelManifiesto:
    """Implementa ``CatalogoClinico`` sobre una versión ya leída del manifiesto."""

    def __init__(self, version: str) -> None:
        self._version = version

    def version(self) -> str:
        return self._version


def cargar_catalogo_del_manifiesto(catalogos: Path) -> CatalogoDelManifiesto:
    """Lee una vez ``<catálogos>/manifest.json`` (``CLINICAL_CATALOG_PATH``, solo lectura)."""
    raise NotImplementedError("no implementado")
