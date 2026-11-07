"""Gate G1 del segundo loop contextual (US-271, ADR-52): ¿la pregunta nombra algún tema? Regla pura, sin E/S.

Una pregunta es «sin tema propio» si, tras normalizarla y quitar las frases de marco y las palabras vacías del léxico
versionado (``lenguaje/marcos-de-pregunta.json``), no queda ninguna palabra de contenido.
"""

from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass

from app.domain.lenguaje import normalizar_texto


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
    """Verdadera si no queda palabra de contenido. Con varios ``idiomas`` rige la unión de sus listas; un idioma que el
    léxico no trae no aporta nada. Una pregunta vacía tras normalizar NO es genérica: la rechaza la validación previa."""
    texto = normalizar_texto(pregunta)
    if not texto:
        return False
    listas = [lexico.por_idioma[i] for i in idiomas if i in lexico.por_idioma]
    sin_marcos = _sin_frases_de_marco(texto, {m for lista in listas for m in lista.marcos})
    vacias = frozenset().union(*(lista.vacias for lista in listas))
    return all(palabra in vacias for palabra in sin_marcos.split())


def _sin_frases_de_marco(texto: str, marcos: set[str]) -> str:
    """Quita cada frase de marco como palabras completas, la más larga primero."""
    for marco in sorted(marcos, key=len, reverse=True):
        texto = re.sub(rf"(?<!\S){re.escape(marco)}(?!\S)", " ", texto)
    return texto
