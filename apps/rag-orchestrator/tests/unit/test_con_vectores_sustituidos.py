"""Regla pura de la reindexación de contexto (US-279 D4): la fila reescrita solo cambia ``dense_vector`` y ``sparse_vector`` (RN-04)."""

from __future__ import annotations

import pytest

from app.domain.corpus_seed.reindexacion import con_vectores_sustituidos

FILA = {
    "chunk_id": "d@1#0000",
    "chunk_text": "Texto original.",
    "is_current": True,
    "dense_vector": [1.0, 0.0],
    "sparse_vector": {1: 0.5},
}


def test_sustituye_los_dos_vectores_y_deja_todo_lo_demas_tal_cual() -> None:
    nueva = con_vectores_sustituidos(FILA, [0.0, 1.0], {7: 0.25})

    assert nueva == {**FILA, "dense_vector": [0.0, 1.0], "sparse_vector": {7: 0.25}}


def test_no_modifica_la_fila_de_origen() -> None:
    copia = {**FILA, "dense_vector": list(FILA["dense_vector"]), "sparse_vector": {1: 0.5}}

    con_vectores_sustituidos(FILA, [0.0, 1.0], {7: 0.25})

    assert FILA == copia


def test_un_sparse_vacio_no_se_escribe_nunca() -> None:
    with pytest.raises(ValueError):
        con_vectores_sustituidos(FILA, [0.0, 1.0], {})
