"""Orden de las opciones mostradas según RN-28, verificado sobre los resúmenes del propio análisis (US-140 AC-1…AC-3).

Reglas puras, sin E/S. Verifican la regla vigente de ``app/domain/applicability_order.py`` (US-125 AC-2, US-134 AC-4);
no la reimplementan: la clave de cada opción sale de ``clave_de_aplicabilidad``.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

from app.domain.applicability_order import clave_de_aplicabilidad


@dataclass(frozen=True)
class OpcionOrdenable:
    """Lo mínimo de una opción mostrada para comprobar su posición: los datos de su fuente más aplicable (ADR-31)."""

    id: str
    excluyentes_no_coincide: int
    coincide: int
    relevance_score: float
    poblacion_no_comparable: bool


def _clave_de(opcion: OpcionOrdenable) -> tuple[int, int, float, str]:
    """El desempate final (``chunkId`` de la cita principal) no viaja en la respuesta: aquí es constante."""
    return clave_de_aplicabilidad(
        opcion.excluyentes_no_coincide, opcion.coincide, opcion.relevance_score, ""
    )


def ids_con_orden_violado(opciones: Sequence[OpcionOrdenable]) -> tuple[str, ...]:
    """Las opciones que aparecen antes de otra más aplicable según RN-28; vacío si la secuencia es no decreciente."""
    return tuple(
        anterior.id
        for anterior, siguiente in zip(opciones, opciones[1:])
        if _clave_de(anterior) > _clave_de(siguiente)
    )


def orden_conforme_rn28(opciones: Sequence[OpcionOrdenable]) -> bool:
    """La secuencia mostrada es no decreciente según la clave de aplicabilidad (RN-28)."""
    return not ids_con_orden_violado(opciones)


def ids_no_comparables_antes_de_una_comparable(
    opciones: Sequence[OpcionOrdenable],
) -> tuple[str, ...]:
    """Las opciones no comparables que preceden a alguna comparable (US-134 AC-4: la no comparable va al final)."""
    return tuple(
        opcion.id
        for posicion, opcion in enumerate(opciones)
        if opcion.poblacion_no_comparable
        and any(not despues.poblacion_no_comparable for despues in opciones[posicion + 1 :])
    )


def no_comparable_al_final(opciones: Sequence[OpcionOrdenable]) -> bool:
    """Ninguna opción no comparable precede a una comparable."""
    return not ids_no_comparables_antes_de_una_comparable(opciones)
