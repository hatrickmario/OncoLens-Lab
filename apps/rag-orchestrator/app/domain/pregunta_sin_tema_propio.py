"""Gate G1 del segundo loop contextual (US-271, ADR-52): ¿la pregunta nombra algún tema? Regla pura, sin E/S.

Una pregunta es «sin tema propio» si, tras normalizarla y quitar las frases de marco y las palabras vacías del léxico
versionado (``lenguaje/marcos-de-pregunta.json``), no queda ninguna palabra de contenido.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass


@dataclass(frozen=True)
class MarcosDeIdioma:
    """Frases de marco y palabras vacías de un idioma, ya normalizadas (``normalizar_texto``)."""

    marcos: tuple[str, ...]
    vacias: frozenset[str]


@dataclass(frozen=True)
class MarcosDePregunta:
    """El léxico versionado: ``version`` del archivo y sus listas por idioma (``es``, ``en``)."""

    version: str
    por_idioma: Mapping[str, MarcosDeIdioma]


def pregunta_sin_tema_propio(
    pregunta: str, lexico: MarcosDePregunta, idiomas: Sequence[str]
) -> bool:
    raise NotImplementedError("no implementado")
