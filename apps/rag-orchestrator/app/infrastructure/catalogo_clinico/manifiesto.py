"""Adapter de ``CatalogoClinico``: la versión sale de ``manifest.json`` del catálogo montado (US-041, D1 y D4)."""

import json
from pathlib import Path

NOMBRE_DEL_MANIFIESTO = "manifest.json"


class CatalogoNoDisponible(RuntimeError):
    """``manifest.json`` falta, no se puede leer o no declara una versión. El mensaje nunca lleva la ruta."""


class CatalogoNoConfigurado(CatalogoNoDisponible):
    """``CLINICAL_CATALOG_PATH`` no está definida (variable ausente, no manifiesto ilegible)."""


class CatalogoDelManifiesto:
    """Implementa ``CatalogoClinico`` sobre una versión ya leída del manifiesto."""

    def __init__(self, version: str) -> None:
        self._version = version

    def version(self) -> str:
        return self._version


def cargar_catalogo_del_manifiesto(catalogos: Path) -> CatalogoDelManifiesto:
    """Lee una vez ``<catálogos>/manifest.json`` (``CLINICAL_CATALOG_PATH``, solo lectura)."""
    try:
        manifiesto = json.loads((catalogos / NOMBRE_DEL_MANIFIESTO).read_text(encoding="utf-8"))
        version = manifiesto["version"]
    except (OSError, ValueError, KeyError, TypeError):
        raise CatalogoNoDisponible("manifest.json no está disponible") from None
    if not isinstance(version, str) or not version:
        raise CatalogoNoDisponible("manifest.json no declara una versión")
    return CatalogoDelManifiesto(version)
