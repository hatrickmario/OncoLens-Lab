"""Lectura paginada de vigentes y reescritura del *sparse* en Milvus real (US-117b D2, AC-2).

Versiones: el Compose de test usa ``milvusdb/milvus:v2.6.25`` y ``pymilvus 3.0.2``. ``query`` con ``limit`` no garantiza el orden
por clave primaria; ``query_iterator`` pagina por PK, y aquí se comprueba con más de 2 páginas que el 100 % de los vigentes
se lee una vez y queda reindexado, aunque se escriba mientras se itera.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest
from pymilvus import MilvusClient

from app.config.settings import MilvusSettings
from app.infrastructure.milvus.repository import MilvusRepository
from tests.support.milvus import chunk_sintetico, vector_unitario

pytestmark = pytest.mark.servicios_reales

RAIZ_APP = Path(__file__).resolve().parents[3]
PLAZO_S = 60

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


def _correr_reindexacion(
    ajustes: MilvusSettings, lote_que_falla: int
) -> subprocess.CompletedProcess[str]:
    """``ingest reindex-sparse`` en un proceso real, con plazo explícito, sobre la colección de test."""
    entorno = {
        **os.environ,
        "PYTHONPATH": str(RAIZ_APP),
        "MILVUS_URI": ajustes.milvus_uri,
        "MILVUS_COLLECTION_NAME": ajustes.milvus_collection_name,
        "EMBEDDING_DIM": str(ajustes.embedding_dim),
        "VECTOR_INDEX_TYPE": ajustes.vector_index_type,
        "VECTOR_INDEX_PARAMS": json.dumps(ajustes.vector_index_params),
        "MILVUS_DENSE_METRIC_TYPE": ajustes.milvus_dense_metric_type,
        "MODEL_PROVIDER": "local",
        "SPARSE_VECTOR_SOURCE": "modelo_embeddings",
        "EMBEDDING_SPARSE_WEIGHTS_PATH": "/models/embeddings/sparse_linear.npz",
        "EMBEDDING_SPARSE_WEIGHTS_SHA256": "ab" * 32,
        "CORPUS_SPARSE_REINDEX_BATCH_SIZE": "5",
        "REINDEX_FALLA_EN_EL_LOTE": str(lote_que_falla),
    }
    return subprocess.run(
        [sys.executable, "-m", "tests.support.reindex_con_milvus_que_falla"],
        cwd=RAIZ_APP,
        env=entorno,
        capture_output=True,
        text=True,
        timeout=PLAZO_S,
        check=False,
    )


def _estado(cliente: MilvusClient, ajustes: MilvusSettings) -> dict[str, dict[str, object]]:
    filas = cliente.query(
        ajustes.milvus_collection_name,
        filter="chunk_id != ''",
        output_fields=["chunk_id", "is_current", "dense_vector", "sparse_vector"],
        consistency_level="Strong",
    )
    return {f["chunk_id"]: f for f in filas}


def test_milvus_que_falla_en_el_segundo_lote_sale_con_error_sin_uri_ni_texto_y_deja_el_dense_intacto(
    repositorio: MilvusRepository, cliente_milvus: MilvusClient, ajustes_milvus: MilvusSettings
) -> None:
    antes = _estado(cliente_milvus, ajustes_milvus)

    proceso = _correr_reindexacion(ajustes_milvus, lote_que_falla=2)

    assert proceso.returncode != 0 and proceso.stdout == ""
    assert "reescribir" in proceso.stderr and "ConnectionError" in proceso.stderr
    assert ajustes_milvus.milvus_uri not in proceso.stderr
    assert "Texto sintético" not in proceso.stderr
    despues = _estado(cliente_milvus, ajustes_milvus)
    assert set(despues) == set(antes)
    assert all(
        (list(despues[i]["dense_vector"]), despues[i]["is_current"])
        == (list(antes[i]["dense_vector"]), antes[i]["is_current"])
        for i in antes
    )
    assert 0 < sum(1 for f in despues.values() if f["sparse_vector"]) < VIGENTES

    reintento = _correr_reindexacion(ajustes_milvus, lote_que_falla=99)

    assert reintento.returncode == 0, reintento.stderr
    completo = _estado(cliente_milvus, ajustes_milvus)
    assert all(f["sparse_vector"] for f in completo.values() if f["is_current"])
