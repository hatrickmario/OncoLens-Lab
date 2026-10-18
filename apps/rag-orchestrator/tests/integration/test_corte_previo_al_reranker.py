"""Corte previo al reranker (decisión del usuario 2026-10-17): RETRIEVAL_TOP_K=30, el reranker recibe los mejores 12.

La similitud dense solo ordena el corte; ``relevance_score`` sigue saliendo del reranker (RN-03).
"""

from dataclasses import replace

import pytest

from tests.support.recuperacion import (
    PARAMETROS_DE_PRUEBA,
    Q_HER2,
    BuscadorFalso,
    ChunkFx,
    RerankerFalso,
    _vector,
    crear_entorno,
    solicitud_de,
)

# 30 chunks vigentes de mama; el chunk "ch-cNN" tiene similitud NN/100 con la pregunta (más alto = más cercano).
CORPUS_DE_30 = tuple(
    ChunkFx(f"ch-c{i:02d}", f"doc-c{i:02d}", f"texto {i}", _vector(e0=i / 100), True, "mama")
    for i in range(1, 31)
)


@pytest.mark.ac("US-231a", 5)
def test_rag_query_entrega_al_reranker_los_12_mejores_por_similitud_cuando_hay_30_candidatos():
    parametros = replace(PARAMETROS_DE_PRUEBA, retrieval_top_k=30, reranker_max_pairs=12)
    reranker = RerankerFalso(max_pairs=12)
    entorno = crear_entorno(
        parametros=parametros, buscador=BuscadorFalso(CORPUS_DE_30), reranker=reranker
    )

    respuesta = entorno.consultar(solicitud_de(Q_HER2))

    assert respuesta.status_code != 503
    assert reranker.candidatos_recibidos == [[f"ch-c{i:02d}" for i in range(30, 18, -1)]]
