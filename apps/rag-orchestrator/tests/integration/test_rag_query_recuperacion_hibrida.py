"""`POST /rag/query` con `RETRIEVAL_MODE = hibrida` (US-112 / L1D-109): ramas dense y sparse falsas sobre FX-06a-a ampliado.

Cada respuesta la valida contra el spec del proveedor el hook de `verificacion_proveedor.py` (US-214).
"""

import pytest

from app.domain.retrieval_filter import expresion_vigente_del_tipo
from tests.support.recuperacion import LONGITUD_MAXIMA_DE_PRUEBA, Q_HER2, Q_SIN, solicitud_de
from tests.support.recuperacion_hibrida import Q_KEYWORD, crear_entorno_hibrido, parametros_hibridos
from app.schemas.generated.models import RetrievalMode


def _candidatos_del_reranker(entorno) -> set[str]:
    return {c for lote in entorno.reranker.candidatos_recibidos for c in lote}


@pytest.mark.ac("US-112", 1)
def test_rag_query_cita_ch_m2_1_cuando_solo_la_rama_sparse_lo_halla_en_modo_hibrido():
    # Línea base: en dense ch-m2-1 queda fuera del top-k, así que el reranker nunca lo vería.
    entorno_dense, _, _ = crear_entorno_hibrido(
        parametros=parametros_hibridos(modo=RetrievalMode.dense)
    )
    entorno_dense.consultar(solicitud_de(Q_KEYWORD))
    assert "ch-m2-1" not in _candidatos_del_reranker(entorno_dense)

    entorno, buscador, _ = crear_entorno_hibrido()

    respuesta = entorno.consultar(solicitud_de(Q_KEYWORD))

    assert respuesta.status_code == 200
    assert buscador.invocaciones_sparse == 1
    assert "ch-m2-1" in _candidatos_del_reranker(entorno)
    cuerpo = respuesta.json()
    assert cuerpo["status"] == "con_evidencia"
    assert cuerpo["evidenceOptions"][0]["citedSources"][0]["chunkId"] == "ch-m2-1"


@pytest.mark.ac("US-112", 2)
def test_rag_query_devuelve_el_relevance_score_del_reranker_cuando_el_chunk_llega_por_la_fusion():
    entorno, _, _ = crear_entorno_hibrido()

    respuesta = entorno.consultar(solicitud_de(Q_KEYWORD))

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert cuerpo["status"] == "con_evidencia"
    assert cuerpo["evidenceOptions"][0]["relevanceScore"] == 0.82
    assert cuerpo["topRelevanceScore"] == 0.82
    puntaje_rrf = 1 / (60 + 1)
    assert cuerpo["evidenceOptions"][0]["relevanceScore"] != pytest.approx(puntaje_rrf)


@pytest.mark.ac("US-112", 3)
def test_rag_query_no_pasa_al_reranker_el_chunk_no_vigente_ni_el_de_otro_tipo_cuando_la_rama_sparse_los_devuelve_primero():
    entorno, buscador, _ = crear_entorno_hibrido()

    respuesta = entorno.consultar(solicitud_de(Q_HER2, tipo_de_cancer="mama"))

    assert respuesta.status_code == 200
    filtro = expresion_vigente_del_tipo("mama", LONGITUD_MAXIMA_DE_PRUEBA)
    assert buscador.expresiones_sparse, "la rama sparse no se ejecutó"
    assert set(buscador.expresiones_sparse) == {filtro}
    assert set(buscador.expresiones) == {filtro}
    assert "is_current == true" in filtro
    candidatos = _candidatos_del_reranker(entorno)
    assert "ch-m1-1" in candidatos
    assert "ch-m1v0-1" not in candidatos
    assert "ch-p1-1" not in candidatos
    assert "ch-m1v0-1" not in respuesta.text
    assert "ch-p1-1" not in respuesta.text


@pytest.mark.ac("US-112", 4)
def test_rag_query_responde_sin_evidencia_sin_invocar_al_llm_cuando_q_sin_no_supera_el_umbral_en_modo_hibrido():
    entorno, buscador, _ = crear_entorno_hibrido()

    respuesta = entorno.consultar(solicitud_de(Q_SIN))

    assert respuesta.status_code == 200
    assert buscador.invocaciones_sparse == 1, "el modo híbrido debe haber ejecutado la rama sparse"
    cuerpo = respuesta.json()
    assert cuerpo["status"] == "sin_evidencia"
    assert cuerpo["evidenceOptions"] == []
    assert cuerpo["topRelevanceScore"] is None
    assert entorno.generador.invocaciones == 0
