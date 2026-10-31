"""Deduplicación y tope de los valores de un criterio (US-242, ADR-47, D4): reglas puras, sin E/S.

El tope rige **por fragmento y criterio** y se lee de configuración (``POPULATION_MAX_VALUES_PER_CRITERION``, RN-22): aquí
llega como argumento, nunca como literal.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Final

from app.domain.aplicabilidad_tipos import ALCANCES, AlcanceDeValor
from app.domain.corpus_metadata.poblacion_abanico import ValorPropuesto
from app.domain.lenguaje import normalizar_texto

# Orden de prioridad del alcance (ADR-47): elegibilidad, subgrupo, mención. Sale de ``ALCANCES``, la fuente única del enum.
_RANGO_DE_ALCANCE: Final[Mapping[AlcanceDeValor, int]] = {
    alcance: posicion for posicion, alcance in enumerate(ALCANCES)
}


@dataclass(frozen=True)
class ConTope:
    conservados: tuple[ValorPropuesto, ...]
    fuera_del_tope: int


def clave_de_comparacion(valor: str, sinonimos: Mapping[str, str]) -> str:
    """Valor normalizado y, si el catálogo lo declara sinónimo de un término canónico, ese término (RN-27).

    ``sinonimos`` mapea texto normalizado -> término canónico normalizado."""
    normalizado = normalizar_texto(valor)
    return sinonimos.get(normalizado, normalizado)


def deduplicar(
    valores: Sequence[ValorPropuesto], sinonimos: Mapping[str, str]
) -> tuple[ValorPropuesto, ...]:
    """Un valor por clave de comparación: el de mayor alcance y, a igual alcance, el primero de la salida (RN-27).

    El resultado conserva el orden en que cada clave apareció por primera vez."""
    mejor: dict[str, tuple[int, int]] = {}
    for posicion, valor in enumerate(valores):
        clave = clave_de_comparacion(valor.valor, sinonimos)
        candidato = (_RANGO_DE_ALCANCE[valor.alcance], posicion)
        if clave not in mejor or candidato < mejor[clave]:
            mejor[clave] = candidato
    return tuple(valores[posicion] for _, posicion in mejor.values())


def aplicar_tope(valores: Sequence[ValorPropuesto], maximo_por_fragmento: int) -> ConTope:
    """Como máximo ``maximo_por_fragmento`` valores por ``chunkId``, en orden elegibilidad, subgrupo, mención y, a igual
    alcance, el de la salida. Los de otros fragmentos del mismo criterio no cuentan para ese tope (ADR-47)."""
    grupos: dict[str, list[tuple[int, int, ValorPropuesto]]] = {}
    for posicion, valor in enumerate(valores):
        grupos.setdefault(valor.chunk_id, []).append(
            (_RANGO_DE_ALCANCE[valor.alcance], posicion, valor)
        )
    conservados: list[ValorPropuesto] = []
    for grupo in grupos.values():
        ordenado = sorted(grupo, key=lambda elemento: elemento[:2])
        conservados.extend(valor for _, _, valor in ordenado[:maximo_por_fragmento])
    return ConTope(tuple(conservados), len(valores) - len(conservados))
