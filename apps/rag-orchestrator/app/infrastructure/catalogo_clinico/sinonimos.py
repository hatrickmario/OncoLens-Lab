"""Sinónimos del catálogo clínico para deduplicar los valores de población (US-242, RN-27): ``<tipo>/sinonimos.json``.

Solo lectura del catálogo montado (``CLINICAL_CATALOG_PATH``). Devuelve un mapa texto normalizado -> término canónico
normalizado; un término canónico se mapea a sí mismo. Un archivo ilegible o fuera de forma es ``CatalogoNoDisponible``
(el mensaje nunca lleva la ruta ni el contenido).
"""

from __future__ import annotations

import json
from collections.abc import Sequence
from pathlib import Path
from typing import Any

from app.domain.lenguaje import normalizar_texto
from app.infrastructure.catalogo_clinico.manifiesto import CatalogoNoDisponible

NOMBRE_DEL_ARCHIVO = "sinonimos.json"


def cargar_sinonimos(catalogos: Path, tipos_de_cancer: Sequence[str]) -> dict[str, str]:
    mapa: dict[str, str] = {}
    for tipo in tipos_de_cancer:
        for item in _items_de(catalogos / tipo / NOMBRE_DEL_ARCHIVO):
            canonico = normalizar_texto(item["terminoCanonico"])
            mapa[canonico] = canonico
            for sinonimo in item["sinonimos"]:
                mapa.setdefault(normalizar_texto(sinonimo["texto"]), canonico)
    return mapa


def _items_de(archivo: Path) -> list[dict[str, Any]]:
    try:
        items = json.loads(archivo.read_text(encoding="utf-8"))["items"]
        return [
            {
                "terminoCanonico": str(item["terminoCanonico"]),
                "sinonimos": [{"texto": str(s["texto"])} for s in item["sinonimos"]],
            }
            for item in items
        ]
    except (OSError, ValueError, KeyError, TypeError):
        raise CatalogoNoDisponible("sinonimos.json no está disponible") from None
