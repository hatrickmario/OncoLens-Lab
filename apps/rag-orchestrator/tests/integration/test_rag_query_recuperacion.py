"""`POST /rag/query`, tramo de recuperación (US-055 / L1D-106): corpus FX-06a-a y bordes falsos, JWT de servicio de test.

Cada respuesta se valida contra el spec del proveedor con `assert_matches_spec` [S1 resp. 17].
"""

from dataclasses import replace

import pytest

from tests.support.contract import assert_matches_spec
from tests.support.recuperacion import (
    PARAMETROS_DE_PRUEBA,
    Q_HER2,
    Q_SIN,
    crear_entorno,
    solicitud_de,
)

RESPUESTA = "#/components/schemas/RagQueryInternalResponse"


@pytest.mark.ac("US-055", 2)
def test_rag_query_responde_sin_evidencia_sin_invocar_al_llm_cuando_la_pregunta_no_tiene_evidencia_sobre_el_umbral():
    entorno = crear_entorno()

    respuesta = entorno.consultar(solicitud_de(Q_SIN))

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert_matches_spec(RESPUESTA, cuerpo)
    assert cuerpo["status"] == "sin_evidencia"
    assert cuerpo["evidenceOptions"] == []
    assert cuerpo["retrievalStats"]["aboveThreshold"] == 0
    assert cuerpo["topRelevanceScore"] is None
    assert entorno.generador.invocaciones == 0


@pytest.mark.ac("US-055", 5)
def test_rag_query_responde_sin_evidencia_sin_invocar_al_llm_cuando_el_umbral_de_configuracion_deja_fuera_todos_los_chunks():
    umbral_alto = replace(PARAMETROS_DE_PRUEBA, relevance_threshold=0.90)
    entorno = crear_entorno(parametros=umbral_alto)

    respuesta = entorno.consultar(solicitud_de(Q_HER2))

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert_matches_spec(RESPUESTA, cuerpo)
    assert cuerpo["status"] == "sin_evidencia"
    assert cuerpo["meta"]["retrievalParams"]["relevanceThreshold"] == 0.90
    assert entorno.generador.invocaciones == 0


@pytest.mark.ac("US-055", 3)
def test_rag_query_excluye_el_chunk_no_vigente_de_los_candidatos_del_reranker_y_de_las_citas_cuando_el_filtro_exige_is_current():
    entorno = crear_entorno()

    respuesta = entorno.consultar(solicitud_de(Q_HER2))

    assert respuesta.status_code == 200
    assert_matches_spec(RESPUESTA, respuesta.json())
    assert entorno.buscador.expresiones, "la búsqueda en Milvus no se ejecutó"
    assert all("is_current == true" in e for e in entorno.buscador.expresiones)
    candidatos = {c for lote in entorno.reranker.candidatos_recibidos for c in lote}
    assert "ch-m1-1" in candidatos
    assert "ch-m1v0-1" not in candidatos
    citables = [c.chunk_id for r in entorno.generador.recuperaciones for c in r.chunks_sobre_umbral]
    assert "ch-m1v0-1" not in citables
    assert "ch-m1v0-1" not in respuesta.text


@pytest.mark.ac("US-055", 4)
def test_rag_query_excluye_el_chunk_de_prostata_de_los_candidatos_cuando_el_contexto_es_de_mama():
    entorno = crear_entorno()

    respuesta = entorno.consultar(solicitud_de(Q_HER2, tipo_de_cancer="mama"))

    assert respuesta.status_code == 200
    assert_matches_spec(RESPUESTA, respuesta.json())
    assert entorno.buscador.expresiones, "la búsqueda en Milvus no se ejecutó"
    assert all('cancer_type_tags like "%mama%"' in e for e in entorno.buscador.expresiones)
    candidatos = {c for lote in entorno.reranker.candidatos_recibidos for c in lote}
    assert "ch-m1-1" in candidatos
    assert "ch-p1-1" not in candidatos


@pytest.mark.ac("US-055", 6)
def test_rag_query_devuelve_el_mismo_relevance_score_en_unidad_y_registra_el_reranker_cuando_se_calcula_dos_veces():
    entorno = crear_entorno()

    primera = entorno.consultar(solicitud_de(Q_HER2))
    segunda = entorno.consultar(solicitud_de(Q_HER2))

    assert primera.status_code == segunda.status_code == 200
    puntajes = [
        [c.relevance_score for c in r.chunks_sobre_umbral] for r in entorno.generador.recuperaciones
    ]
    assert len(puntajes) == 2
    assert puntajes[0] == puntajes[1]
    assert puntajes[0] and all(0.0 <= p <= 1.0 for p in puntajes[0])
    assert primera.json() == segunda.json()
    for recuperacion in entorno.generador.recuperaciones:
        assert recuperacion.meta.rerankerModel == entorno.reranker.version


@pytest.mark.ac("US-055", 6)
def test_rag_query_registra_la_version_del_reranker_en_meta_cuando_responde_sin_evidencia():
    entorno = crear_entorno()

    respuesta = entorno.consultar(solicitud_de(Q_SIN))

    assert respuesta.status_code == 200
    assert respuesta.json()["meta"]["rerankerModel"] == entorno.reranker.version
