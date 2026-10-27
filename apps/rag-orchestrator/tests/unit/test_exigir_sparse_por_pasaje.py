"""Regla única «un vector sparse no vacío por pasaje» (Gate 2 B1 de US-117b): la comparten la ingesta y la reindexación."""

from __future__ import annotations

import pytest

from app.domain.corpus_seed.errores import VectorSparseVacio
from app.domain.corpus_seed.sparse import exigir_sparse_por_pasaje


def test_devuelve_los_vectores_cuando_hay_uno_no_vacio_por_pasaje() -> None:
    vectores = [{1: 0.5}, {2: 0.1, 3: 0.2}]

    assert exigir_sparse_por_pasaje(vectores, 2) == vectores


def test_rechaza_cuando_algun_vector_esta_vacio() -> None:
    with pytest.raises(VectorSparseVacio):
        exigir_sparse_por_pasaje([{1: 0.5}, {}], 2)


@pytest.mark.parametrize("vectores", [[{1: 0.5}], [{1: 0.5}, {2: 0.5}, {3: 0.5}], []])
def test_rechaza_cuando_la_cantidad_no_coincide_con_la_de_pasajes(
    vectores: list[dict[int, float]],
) -> None:
    with pytest.raises(VectorSparseVacio):
        exigir_sparse_por_pasaje(vectores, 2)


def test_acepta_cero_pasajes_con_cero_vectores() -> None:
    assert exigir_sparse_por_pasaje([], 0) == []
