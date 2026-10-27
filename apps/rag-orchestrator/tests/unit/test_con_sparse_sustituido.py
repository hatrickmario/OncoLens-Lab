"""Regla pura de la reindexación *sparse* (US-117b D2): solo cambia ``sparse_vector``."""

from __future__ import annotations

import pytest

from app.domain.corpus_seed.reindexacion import CAMPO_SPARSE_VECTOR, con_sparse_sustituido

FILA = {
    "chunk_id": "d@1#0000",
    "document_id": "d@1",
    "dense_vector": [0.1, 0.2],
    "sparse_vector": {},
    "chunk_text": "texto",
    "is_current": True,
}


def test_devuelve_la_fila_con_el_sparse_nuevo() -> None:
    nueva = con_sparse_sustituido(FILA, {3: 0.5})

    assert nueva[CAMPO_SPARSE_VECTOR] == {3: 0.5}


def test_conserva_cada_otro_campo_sin_cambios() -> None:
    nueva = con_sparse_sustituido(FILA, {3: 0.5})

    assert {k: v for k, v in nueva.items() if k != CAMPO_SPARSE_VECTOR} == {
        k: v for k, v in FILA.items() if k != CAMPO_SPARSE_VECTOR
    }


def test_no_modifica_la_fila_original() -> None:
    con_sparse_sustituido(FILA, {3: 0.5})

    assert FILA[CAMPO_SPARSE_VECTOR] == {}


def test_rechaza_un_sparse_vacio_porque_milvus_lo_rechazaria() -> None:
    with pytest.raises(ValueError):
        con_sparse_sustituido(FILA, {})
