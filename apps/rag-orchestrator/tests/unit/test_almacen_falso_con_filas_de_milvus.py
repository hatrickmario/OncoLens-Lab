"""El almacén falso acepta las filas con la FORMA REAL de Milvus (US-279 D4, regresión de integration-rag).

La reindexación lee filas de un almacén y las escribe en otro; con el origen en Milvus real y el destino en memoria (los tests de integración),
la fila trae ``created_at`` (el campo de la colección) y no ``created_at_ms`` (el del dataclass). El contrato de ``AlmacenDeReindexacionDeContexto``
solo probaba memoria→memoria y Milvus→Milvus: nunca esa mezcla.
"""

from __future__ import annotations

from app.infrastructure.milvus.repository import MilvusRepository
from tests.support.almacenes_falsos import AlmacenDeChunksEnMemoria
from tests.support.milvus import chunk_sintetico, vector_unitario


def test_el_almacen_en_memoria_escribe_una_fila_con_la_forma_que_devuelve_milvus() -> None:
    chunk = chunk_sintetico("v001", vector_unitario(8, 1), sparse={3: 0.5})
    fila = MilvusRepository._fila(chunk)  # la fila tal como Milvus la guarda y la devuelve
    almacen = AlmacenDeChunksEnMemoria()

    escritas = almacen.escribir_filas([fila])

    assert escritas == 1
    guardado = almacen.chunks["v001"]
    assert guardado.chunk_text == chunk.chunk_text and guardado.created_at_ms == chunk.created_at_ms
    assert list(guardado.dense_vector) == list(chunk.dense_vector)
    assert dict(guardado.sparse_vector or {}) == {3: 0.5}


def test_el_almacen_en_memoria_ignora_un_campo_que_el_dataclass_no_tiene() -> None:
    fila = {**MilvusRepository._fila(chunk_sintetico("v002", vector_unitario(8, 2))), "extra": 1}

    AlmacenDeChunksEnMemoria().escribir_filas([fila])
