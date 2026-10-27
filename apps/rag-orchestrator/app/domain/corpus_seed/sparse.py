"""Regla única del *sparse* por pasaje (ingesta y reindexación): un vector no vacío por texto, en el mismo orden."""

from __future__ import annotations

from collections.abc import Sequence

from app.domain.corpus_seed.errores import VectorSparseVacio


def exigir_sparse_por_pasaje(
    vectores: Sequence[dict[int, float]], n_pasajes: int
) -> Sequence[dict[int, float]]:
    """Devuelve ``vectores`` si hay exactamente uno por pasaje y ninguno vacío; si no, ``VectorSparseVacio``: Milvus rechaza el
    vector vacío y un desajuste de cantidad desalinearía los textos y sus vectores."""
    if len(vectores) != n_pasajes or not all(vectores):
        raise VectorSparseVacio()
    return vectores
