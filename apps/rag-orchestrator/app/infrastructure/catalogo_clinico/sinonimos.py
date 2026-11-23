"""Sinónimos del catálogo clínico (US-242, US-277, RN-27): ``<tipo>/sinonimos.json``.

Solo lectura del catálogo montado (``CLINICAL_CATALOG_PATH``). Cada sinónimo declara su ``relacion`` con el canónico y la
regla S-1 (``app.domain.sinonimos``) decide cuáles lo equiparan: ``cargar_sinonimos`` devuelve solo canónicos y
equivalentes; ``cargar_formas_por_termino`` devuelve todos los textos, con cualquier relación. Un archivo ilegible, fuera de
forma o con un sinónimo sin ``relacion`` válida es ``CatalogoNoDisponible`` (el mensaje nunca lleva la ruta ni el contenido).
"""

from __future__ import annotations

import json
from collections.abc import Collection, Sequence
from itertools import chain
from pathlib import Path

from app.domain.lenguaje import normalizar_texto
from app.domain.sinonimos import RelacionDeSinonimo, es_equivalente
from app.infrastructure.catalogo_clinico.manifiesto import CatalogoNoDisponible

NOMBRE_DEL_ARCHIVO = "sinonimos.json"

_RELACIONES_DE_PERTINENCIA = (RelacionDeSinonimo.equivalente, RelacionDeSinonimo.miembro_de_clase)
_TerminoDelCatalogo = tuple[str, list[tuple[str, RelacionDeSinonimo]]]


def cargar_sinonimos(catalogos: Path, tipos_de_cancer: Sequence[str]) -> dict[str, str]:
    """Texto normalizado -> canónico, solo para el propio canónico y sus sinónimos ``equivalente`` (S-1): lo que equipara."""
    mapa: dict[str, str] = {}
    for tipo in tipos_de_cancer:
        for canonico, textos in _terminos_de(catalogos / tipo / NOMBRE_DEL_ARCHIVO):
            mapa[canonico] = canonico
            for texto, relacion in textos:
                if es_equivalente(relacion):
                    mapa.setdefault(texto, canonico)
    return mapa


def cargar_formas_por_termino(
    catalogos: Path,
    tipos_de_cancer: Sequence[str],
    relaciones: Collection[RelacionDeSinonimo] = tuple(RelacionDeSinonimo),
) -> dict[str, frozenset[str]]:
    """Canónico normalizado -> él y sus textos de las ``relaciones`` pedidas (por defecto todas): lo que reconoce un término
    como del tema sin equipararlo (pertinencia del seguimiento, formas de un término en la medición contextual)."""
    formas: dict[str, set[str]] = {}
    for tipo in tipos_de_cancer:
        for canonico, textos in _terminos_de(catalogos / tipo / NOMBRE_DEL_ARCHIVO):
            formas.setdefault(canonico, {canonico}).update(
                texto for texto, relacion in textos if relacion in relaciones
            )
    return {canonico: frozenset(textos) for canonico, textos in formas.items()}


def _terminos_de(archivo: Path) -> list[_TerminoDelCatalogo]:
    """Cada ``terminoCanonico`` con sus textos y la relación de cada uno, normalizados. Una ``relacion`` ausente o fuera del
    enum es un error del catálogo, no un equivalente presunto."""
    try:
        items = json.loads(archivo.read_text(encoding="utf-8"))["items"]
        return [
            (
                normalizar_texto(str(item["terminoCanonico"])),
                [
                    (normalizar_texto(str(s["texto"])), RelacionDeSinonimo(s["relacion"]))
                    for s in item["sinonimos"]
                ],
            )
            for item in items
        ]
    except (OSError, ValueError, KeyError, TypeError):
        raise CatalogoNoDisponible("sinonimos.json no está disponible") from None


def cargar_terminos_del_catalogo(catalogos: Path, tipos_de_cancer: Sequence[str]) -> frozenset[str]:
    """Los términos canónicos y sinónimos equivalentes del catálogo montado, normalizados: lo único que la reescritura puede
    agregar (RN-27, S-1)."""
    return frozenset(cargar_sinonimos(catalogos, tipos_de_cancer))


def cargar_terminos_por_tipo(
    catalogos: Path, tipos_de_cancer: Sequence[str]
) -> dict[str, frozenset[str]]:
    """Por tipo de cáncer: su código, los canónicos y los textos ``equivalente`` y ``miembro_de_clase`` de su
    ``sinonimos.json``, normalizados; nunca los ``mas_amplio`` (no son exclusivos del término: «observación» no es de
    próstata). Lo usa la regla determinista de pertinencia del seguimiento (US-218, design D7, D15)."""
    return {
        tipo: frozenset(
            {
                normalizar_texto(tipo),
                *chain.from_iterable(
                    cargar_formas_por_termino(
                        catalogos, [tipo], _RELACIONES_DE_PERTINENCIA
                    ).values()
                ),
            }
        )
        for tipo in tipos_de_cancer
    }
