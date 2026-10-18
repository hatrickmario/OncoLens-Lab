"""Preparación de las secuencias para el modelo: truncado y lotes por presupuesto de tokens (funciones puras)."""

from __future__ import annotations

from collections.abc import Sequence


def truncar_conservando_el_separador_final(ids: list[int], max_length: int) -> list[int]:
    """Recorta a ``max_length`` conservando el token especial final, como en la medición de ADR-39."""
    if len(ids) <= max_length:
        return ids
    return [*ids[: max_length - 1], ids[-1]]


def agrupar_por_presupuesto_de_tokens(
    secuencias: Sequence[Sequence[int]], presupuesto: int
) -> list[list[int]]:
    """Índices agrupados por largo creciente (desempate por posición) sin pasar del presupuesto, relleno incluido.

    Determinista: la misma entrada da los mismos lotes, y con ellos el mismo relleno y los mismos puntajes (IA-07).
    """
    lotes: list[list[int]] = []
    actual: list[int] = []
    for indice in sorted(range(len(secuencias)), key=lambda i: (len(secuencias[i]), i)):
        if actual and (len(actual) + 1) * len(secuencias[indice]) > presupuesto:
            lotes.append(actual)
            actual = []
        actual.append(indice)
    if actual:
        lotes.append(actual)
    return lotes
