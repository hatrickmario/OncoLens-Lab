"""US-055 AC-3 y AC-4 contra un Milvus real de test: el filtro vigente y del tipo de cáncer se evalúa en el motor.

Test después (infraestructura): el servicio es el real y Milvus también; solo los *embeddings* y el *reranker* son
falsos (FX-06a-a). Colección temporal ``corpus_test_*``, nunca ``corpus_chunks``. Se pide con ``-m servicios_reales``.
"""

from __future__ import annotations

from dataclasses import replace

import pytest
from pymilvus import MilvusClient

from app.config.settings import MilvusSettings
from app.domain.retrieval_filter import expresion_solo_vigente, expresion_vigente_del_tipo
from app.infrastructure.milvus.repository import MilvusRepository
from tests.support.contract import assert_matches_spec
from tests.support.recuperacion import (
    CORPUS_FX06A,
    DIMENSION,
    Q_HER2,
    cargar_fx06a_en_milvus,
    chunk_del_corpus,
    crear_entorno,
    solicitud_de,
)

pytestmark = pytest.mark.servicios_reales

RESPUESTA = "#/components/schemas/RagQueryInternalResponse"


@pytest.fixture
def repositorio(cliente_milvus: MilvusClient, ajustes_milvus: MilvusSettings) -> MilvusRepository:
    assert ajustes_milvus.embedding_dim == DIMENSION
    repositorio = MilvusRepository(cliente_milvus, ajustes_milvus)
    assert cargar_fx06a_en_milvus(repositorio) == len(CORPUS_FX06A)  # humo del fixture FX-06a-a
    cliente_milvus.flush(ajustes_milvus.milvus_collection_name)
    return repositorio


@pytest.mark.ac("US-055", 3)
def test_milvus_excluye_el_chunk_no_vigente_aunque_su_similitud_sea_mayor(
    repositorio: MilvusRepository,
) -> None:
    vector_de_q_her2 = [1.0] + [0.0] * (DIMENSION - 1)

    encontrados = repositorio.search_dense(vector_de_q_her2, 10, expresion_solo_vigente())

    ids = [c.chunk_id for c in encontrados]
    assert "ch-m1v0-1" not in ids  # similitud 1.0 (la más alta) pero is_current = false
    assert {"ch-m1-1", "ch-p1-1", "ch-inj-1"} == set(ids)


@pytest.mark.ac("US-055", 4)
def test_milvus_excluye_el_chunk_de_prostata_cuando_el_filtro_es_de_mama(
    repositorio: MilvusRepository,
) -> None:
    vector_de_q_her2 = [1.0] + [0.0] * (DIMENSION - 1)

    encontrados = repositorio.search_dense(vector_de_q_her2, 10, expresion_vigente_del_tipo("mama"))

    assert {c.chunk_id for c in encontrados} == {"ch-m1-1", "ch-inj-1"}


@pytest.mark.parametrize(
    ("tipo", "esperados"),
    [
        (
            "mama",
            {"ch-m1-1", "ch-inj-1", "ch-multi-1"},
        ),  # etiqueta completa, también dentro de una lista
        (
            "ta",
            set(),
        ),  # 'ta' es subcadena de 'prostata' y de 'mama_masculina', pero no una etiqueta
        ("a", set()),
        ("mama_masculina", {"ch-mm-1"}),
    ],
)
def test_milvus_compara_la_etiqueta_completa_de_cancer_type_tags(
    repositorio: MilvusRepository,
    cliente_milvus: MilvusClient,
    ajustes_milvus: MilvusSettings,
    tipo: str,
    esperados: set[str],
) -> None:
    base = chunk_del_corpus(CORPUS_FX06A[0])
    repositorio.insert_chunks(
        [
            replace(base, chunk_id="ch-mm-1", cancer_type_tags="mama_masculina"),
            replace(base, chunk_id="ch-multi-1", cancer_type_tags="prostata,mama"),
            # `_` es comodín de `like`: sin escapar, `mama_masculina` también casaría con `mamaxmasculina`.
            replace(base, chunk_id="ch-mxm-1", cancer_type_tags="mamaxmasculina"),
            replace(base, chunk_id="ch-mxm-2", cancer_type_tags="prostata,mamaxmasculina,pulmon"),
        ]
    )
    cliente_milvus.flush(
        ajustes_milvus.milvus_collection_name
    )  # la consistencia por defecto es Bounded
    vector = [1.0] + [0.0] * (DIMENSION - 1)

    encontrados = repositorio.search_dense(vector, 20, expresion_vigente_del_tipo(tipo))

    assert {c.chunk_id for c in encontrados} == esperados


@pytest.mark.ac("US-055", 3)
def test_rag_query_no_cita_ni_reranquea_el_chunk_no_vigente_con_milvus_real(
    repositorio: MilvusRepository,
) -> None:
    entorno = crear_entorno(buscador=repositorio)

    respuesta = entorno.consultar(solicitud_de(Q_HER2))

    assert respuesta.status_code == 200
    assert_matches_spec(RESPUESTA, respuesta.json())
    candidatos = {c for lote in entorno.reranker.candidatos_recibidos for c in lote}
    assert candidatos == {"ch-m1-1", "ch-inj-1"}
    assert "ch-m1v0-1" not in respuesta.text and "ch-p1-1" not in respuesta.text
