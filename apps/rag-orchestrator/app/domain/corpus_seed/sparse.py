"""Regla única del *sparse* por pasaje (ingesta y reindexación): un vector no vacío por texto, en el mismo orden."""

from __future__ import annotations

from collections.abc import Sequence


def exigir_sparse_por_pasaje(
    vectores: Sequence[dict[int, float]], n_pasajes: int
) -> Sequence[dict[int, float]]:
    raise NotImplementedError("no implementado")
