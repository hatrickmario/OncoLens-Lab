"""Lectura paginada de vigentes y reescritura del *sparse* en Milvus real (US-117b D2, AC-2).

Versiones: el Compose de test usa ``milvusdb/milvus:v2.6.25`` y ``pymilvus 3.0.2``. ``query`` con ``limit`` no garantiza el orden
por clave primaria; ``query_iterator`` pagina por PK, y aquí se comprueba con más de 2 páginas que el 100 % de los vigentes
se lee una vez y queda reindexado, aunque se escriba mientras se itera.
"""

from __future__ import annotations

import pytest
from pymilvus import MilvusClient

from app.config.settings import MilvusSettings
from app.infrastructure.milvus.repository import MilvusRepository
from tests.support.milvus import chunk_sintetico, vector_unitario

pytestmark = pytest.mark.servicios_reales

DIMENSION = 8
VIGENTES = 25
LOTE = 10  # 25 vigentes en 3 páginas (10 + 10 + 5)


def _dense(indice: int) -> list[float]:
    return vector_unitario(DIMENSION, indice % DIMENSION)


@pytest.fixture
def repositorio(cliente_milvus: MilvusClient, ajustes_milvus: MilvusSettings) -> MilvusRepository:
    repositorio = MilvusRepository(cliente_milvus, ajustes_milvus)
    repositorio.ensure_collection()
    repositorio.insert_chunks(
        [chunk_sintetico(f"v{i:03d}", _dense(i)) for i in range(VIGENTES)]
        + [chunk_sintetico(f"n{i:03d}", _dense(i), vigente=False) for i in range(3)]
    )
    return repositorio


def test_pagina_todos_los_vigentes_exactamente_una_vez_y_ningun_no_vigente(
    repositorio: MilvusRepository,
) -> None:
    paginas = list(repositorio.listar_vigentes_paginado(LOTE))

    ids = [chunk.chunk_id for pagina in paginas for chunk in pagina]
    assert [len(p) for p in paginas] == [10, 10, 5]
    assert sorted(ids) == [f"v{i:03d}" for i in range(VIGENTES)] and len(set(ids)) == VIGENTES


def test_reindexa_el_100_por_ciento_de_los_vigentes_sin_cambiar_dense_ni_no_vigentes_aunque_escriba_mientras_pagina(
    repositorio: MilvusRepository, cliente_milvus: MilvusClient, ajustes_milvus: MilvusSettings
) -> None:
    for pagina in repositorio.listar_vigentes_paginado(LOTE):
        repositorio.reescribir_sparse(pagina, [{indice: 0.5} for indice, _ in enumerate(pagina, 1)])

    filas = cliente_milvus.query(
        ajustes_milvus.milvus_collection_name,
        filter="chunk_id != ''",
        output_fields=["chunk_id", "is_current", "dense_vector", "sparse_vector"],
        consistency_level="Strong",
    )
    por_id = {f["chunk_id"]: f for f in filas}
    assert len(filas) == VIGENTES + 3
    vigentes = {i: f for i, f in por_id.items() if f["is_current"]}
    assert len(vigentes) == VIGENTES and all(f["sparse_vector"] for f in vigentes.values())
    assert all(list(f["dense_vector"]) == _dense(int(i[1:])) for i, f in por_id.items())
    assert all(not f["sparse_vector"] for f in por_id.values() if not f["is_current"])
