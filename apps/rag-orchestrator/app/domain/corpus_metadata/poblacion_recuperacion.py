"""Selección de los k fragmentos de un documento para un criterio (US-242, ADR-47, D3): regla pura, sin E/S.

Puntaje léxico determinista: cuántos términos distintos del criterio (etiqueta, clave y sinónimos de la clave) y de las
secciones donde un estudio declara su población (métodos, elegibilidad, población) aparecen en el fragmento. Empata el
fragmento que aparece antes. Es una primera aproximación medida por US-233b; la búsqueda híbrida del corpus no puede
usarse aquí porque el paso de metadatos corre antes de indexar el documento.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Final

from app.domain.lenguaje import normalizar_texto

LONGITUD_MINIMA_DE_TERMINO: Final = 3
# Palabras de las secciones donde un estudio declara su población, en español e inglés.
TERMINOS_DE_SECCIONES_DE_POBLACION: Final = (
    "eligibility",
    "eligible",
    "inclusion",
    "methods",
    "population",
    "patients",
    "participants",
    "elegibilidad",
    "elegibles",
    "inclusión",
    "métodos",
    "población",
    "pacientes",
    "participantes",
)


def terminos_de_consulta(*textos_del_criterio: str | None) -> frozenset[str]:
    """Términos normalizados del criterio y de las secciones de población."""
    candidatos = [t for t in textos_del_criterio if t] + list(TERMINOS_DE_SECCIONES_DE_POBLACION)
    return frozenset(
        palabra
        for texto in candidatos
        for palabra in normalizar_texto(texto).split()
        if len(palabra) >= LONGITUD_MINIMA_DE_TERMINO
    )


def puntaje_lexical(texto: str, terminos: frozenset[str]) -> int:
    return len(terminos & set(normalizar_texto(texto).split()))


def indices_mas_relevantes(
    textos: Sequence[str], terminos: frozenset[str], k: int
) -> tuple[int, ...]:
    """Índices de los ``k`` fragmentos de mayor puntaje; a igual puntaje, el de menor índice. Sin puntaje 0 sobrante:
    un fragmento sin ningún término se descarta (no aporta a la tarea)."""
    puntuados = [(puntaje_lexical(texto, terminos), indice) for indice, texto in enumerate(textos)]
    elegidos = sorted((p for p in puntuados if p[0] > 0), key=lambda p: (-p[0], p[1]))[:k]
    return tuple(indice for _, indice in elegidos)
