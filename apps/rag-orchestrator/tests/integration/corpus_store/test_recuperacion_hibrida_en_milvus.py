"""US-112 contra un Milvus real de test: la rama sparse y la híbrida con el filtro evaluado en el motor (RN-05).

Test después (infraestructura): el servicio y Milvus son reales; solo los *embeddings*, el *reranker* y el LLM son falsos.
Colección temporal ``corpus_test_*``, nunca ``corpus_chunks``. Se pide con ``-m servicios_reales`` (job ``integration-rag``).
"""

from __future__ import annotations

import pytest
from pymilvus import MilvusClient

from app.config.settings import MilvusSettings
from app.domain.retrieval_filter import expresion_solo_vigente, expresion_vigente_del_tipo
from app.infrastructure.milvus.repository import MilvusRepository
from tests.support.recuperacion import (
    DIMENSION,
    LONGITUD_MAXIMA_DE_PRUEBA,
    Q_HER2,
    chunk_del_corpus,
    solicitud_de,
)
from tests.support.recuperacion_hibrida import (
    CORPUS_HIBRIDO,
    Q_KEYWORD,
    TERMINO_HER2,
    crear_entorno_hibrido,
)

pytestmark = pytest.mark.servicios_reales


@pytest.fixture
def repositorio(cliente_milvus: MilvusClient, ajustes_milvus: MilvusSettings) -> MilvusRepository:
    assert ajustes_milvus.embedding_dim == DIMENSION
    repositorio = MilvusRepository(cliente_milvus, ajustes_milvus)
    repositorio.ensure_collection()
    assert repositorio.insert_chunks([chunk_del_corpus(c) for c in CORPUS_HIBRIDO]) == len(
        CORPUS_HIBRIDO
    )
    cliente_milvus.flush(ajustes_milvus.milvus_collection_name)
    return repositorio


def test_milvus_sparse_devuelve_el_chunk_con_el_termino_en_comun_y_ordena_por_producto_interno(
    repositorio: MilvusRepository,
) -> None:
    encontrados = repositorio.search_sparse(
        {TERMINO_HER2: 1.0}, 10, expresion_vigente_del_tipo("mama", LONGITUD_MAXIMA_DE_PRUEBA)
    )

    assert [c.chunk_id for c in encontrados] == ["ch-m1-1"]
    assert encontrados[0].similitud_sparse == pytest.approx(0.4)


def test_milvus_sparse_excluye_el_chunk_no_vigente_aunque_su_producto_interno_sea_mayor(
    repositorio: MilvusRepository,
) -> None:
    encontrados = repositorio.search_sparse({TERMINO_HER2: 1.0}, 10, expresion_solo_vigente())

    ids = [c.chunk_id for c in encontrados]
    assert "ch-m1v0-1" not in ids  # 0.95 (el mayor) pero is_current = false
    assert ids == ["ch-m1-1"]


@pytest.mark.ac("US-112", 1)
def test_rag_query_hibrida_cita_ch_m2_1_con_milvus_real_cuando_solo_la_rama_sparse_lo_halla(
    repositorio: MilvusRepository,
) -> None:
    entorno, _, _ = crear_entorno_hibrido(buscador=repositorio)

    respuesta = entorno.consultar(solicitud_de(Q_KEYWORD))

    assert respuesta.status_code == 200
    candidatos = {c for lote in entorno.reranker.candidatos_recibidos for c in lote}
    assert "ch-m2-1" in candidatos
    assert respuesta.json()["evidenceOptions"][0]["citedSources"][0]["chunkId"] == "ch-m2-1"


@pytest.mark.ac("US-112", 3)
def test_rag_query_hibrida_no_pasa_al_reranker_el_chunk_no_vigente_con_milvus_real(
    repositorio: MilvusRepository,
) -> None:
    entorno, _, _ = crear_entorno_hibrido(buscador=repositorio)

    respuesta = entorno.consultar(solicitud_de(Q_HER2))

    assert respuesta.status_code == 200
    candidatos = {c for lote in entorno.reranker.candidatos_recibidos for c in lote}
    assert "ch-m1-1" in candidatos
    assert "ch-m1v0-1" not in candidatos and "ch-p1-1" not in candidatos
    assert "ch-m1v0-1" not in respuesta.text
