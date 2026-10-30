"""`POST /rag/query` con `RETRIEVAL_MODE = hibrida` (US-112 / L1D-109): ramas dense y sparse falsas sobre FX-06a-a ampliado.

Cada respuesta la valida contra el spec del proveedor el hook de `verificacion_proveedor.py` (US-214).
"""

import logging

import pytest

from app.domain.retrieval_filter import expresion_vigente_del_tipo
from tests.support.recuperacion import LONGITUD_MAXIMA_DE_PRUEBA, Q_HER2, Q_SIN, solicitud_de
from tests.support.recuperacion_hibrida import Q_KEYWORD, crear_entorno_hibrido, parametros_hibridos
from app.domain.fusion_de_candidatos import EstrategiaDeFusion
from app.schemas.generated.models import RetrievalMode
from tests.support.generador_falso import OPCION_ANTI_HER2, RAZON_ANTI_HER2
from tests.support.recuperacion_hibrida import CORPUS_HIBRIDO, TOP_K_ESTRECHO
from app.application.ports import FalloDeInferencia
from tests.support.recuperacion import BuscadorFalso, crear_entorno


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


@pytest.mark.ac("US-112", 5)
def test_rag_query_traza_modo_fusion_y_k_en_meta_cuando_la_fusion_es_rrf():
    entorno, _, _ = crear_entorno_hibrido(parametros=parametros_hibridos(rrf_k=60))

    respuesta = entorno.consultar(solicitud_de(Q_KEYWORD))

    assert respuesta.status_code == 200
    params = respuesta.json()["meta"]["retrievalParams"]
    assert params["retrievalMode"] == "hibrida"
    assert params["fusion"] == "rrf"
    assert params["fusionParam"] == 60
    assert all(valor is not None for valor in params.values())


@pytest.mark.ac("US-112", 5)
def test_rag_query_no_registra_texto_en_los_logs_de_la_recuperacion_hibrida(caplog):
    entorno, _, _ = crear_entorno_hibrido()
    caplog.set_level(logging.DEBUG)

    respuesta = entorno.consultar(solicitud_de(Q_KEYWORD))

    assert respuesta.status_code == 200
    mensajes = [r.getMessage() for r in caplog.records]
    recuperacion = [m for m in mensajes if "event=rag_query_recuperacion_hibrida" in m]
    assert len(recuperacion) == 1, (
        "la recuperación híbrida debe dejar un único log con sus recuentos"
    )
    for esperado in (
        "retrievalMode=hibrida",
        "fusion=rrf",
        "fusionParam=60",
        "dense=2 sparse=1 fused=2",
    ):
        assert esperado in recuperacion[0]
    prohibidos = [Q_KEYWORD, OPCION_ANTI_HER2, RAZON_ANTI_HER2, *(c.texto for c in CORPUS_HIBRIDO)]
    for mensaje in mensajes:
        for prohibido in prohibidos:
            assert prohibido not in mensaje, f"{prohibido!r} aparece en un log"


@pytest.mark.ac("US-112", 6)
def test_rag_query_recupera_en_dense_sin_llamar_a_la_rama_sparse_cuando_el_modo_no_esta_definido():
    entorno, buscador, codificador = crear_entorno_hibrido(
        parametros=parametros_hibridos(modo=RetrievalMode.dense)
    )

    respuesta = entorno.consultar(solicitud_de(Q_KEYWORD))

    assert respuesta.status_code == 200
    assert buscador.invocaciones_sparse == 0
    assert codificador.invocaciones == 0
    assert "ch-m2-1" not in _candidatos_del_reranker(entorno)
    params = respuesta.json()["meta"]["retrievalParams"]
    assert params["retrievalMode"] == "dense"
    assert params["fusion"] == "ninguna"
    assert params["fusionParam"] == 0
    assert all(valor is not None for valor in params.values())


@pytest.mark.ac("US-112", 6)
def test_rag_query_recupera_con_la_fusion_ponderada_y_traza_su_peso_cuando_se_configura():
    parametros = parametros_hibridos(fusion=EstrategiaDeFusion.ponderada, peso_sparse=0.3)
    entorno, _, _ = crear_entorno_hibrido(parametros=parametros)

    respuesta = entorno.consultar(solicitud_de(Q_KEYWORD))

    assert respuesta.status_code == 200
    assert "ch-m2-1" in _candidatos_del_reranker(entorno)
    params = respuesta.json()["meta"]["retrievalParams"]
    assert params["fusion"] == "ponderada"
    assert params["fusionParam"] == 0.3


@pytest.mark.ac("US-112", 1)
def test_rag_query_pasa_al_reranker_el_chunk_solo_sparse_cuando_el_tope_de_pares_es_uno():
    # Con el peso sparse alto, ch-m2-1 (solo sparse) es el primero de la fusión; el corte previo al reranker lo respeta.
    parametros = parametros_hibridos(
        fusion=EstrategiaDeFusion.ponderada, peso_sparse=0.9, reranker_max_pairs=1
    )
    entorno, _, _ = crear_entorno_hibrido(parametros=parametros)

    respuesta = entorno.consultar(solicitud_de(Q_KEYWORD))

    assert respuesta.status_code == 200
    assert entorno.reranker.candidatos_recibidos == [["ch-m2-1"]]


@pytest.mark.ac("US-112", 1)
def test_rag_query_no_pasa_al_reranker_mas_candidatos_que_el_top_k_cuando_las_ramas_suman_mas():
    entorno, buscador, _ = crear_entorno_hibrido()

    respuesta = entorno.consultar(solicitud_de(Q_KEYWORD))

    assert respuesta.status_code == 200
    assert len(entorno.reranker.candidatos_recibidos[0]) <= TOP_K_ESTRECHO
    assert buscador.limites_sparse == [TOP_K_ESTRECHO]


def test_rag_query_responde_503_sin_invocar_al_llm_cuando_falla_la_busqueda_sparse():
    fallo = RuntimeError("milvus-interno.test:19530 rechazó la búsqueda sparse")
    entorno, _, _ = crear_entorno_hibrido(
        buscador=BuscadorFalso(CORPUS_HIBRIDO, error_sparse=fallo)
    )

    respuesta = entorno.consultar(solicitud_de(Q_KEYWORD))

    assert respuesta.status_code == 503
    assert respuesta.json()["error"] == "RETRIEVAL_UNAVAILABLE"
    assert "milvus-interno" not in respuesta.text
    assert entorno.generador.invocaciones == 0


def test_rag_query_responde_503_sin_invocar_al_llm_cuando_falla_el_codificador_sparse():
    entorno, _, codificador = crear_entorno_hibrido()
    codificador.error = FalloDeInferencia("sparse: fallo de inferencia del modelo local")

    respuesta = entorno.consultar(solicitud_de(Q_KEYWORD))

    assert respuesta.status_code == 503
    assert respuesta.json()["error"] == "RETRIEVAL_UNAVAILABLE"
    assert entorno.generador.invocaciones == 0


def test_el_servicio_se_niega_a_construirse_en_modo_hibrido_sin_las_ramas_sparse():
    with pytest.raises(ValueError, match="hibrida"):
        crear_entorno(parametros=parametros_hibridos())


def test_rag_query_no_registra_texto_libre_del_contexto_en_los_logs_de_la_recuperacion_hibrida(
    caplog,
):
    sentinela = "SENTINELA-HISTOLOGIA-109"
    solicitud = solicitud_de(Q_KEYWORD)
    solicitud["clinicalContext"]["diagnosis"]["histology"] = sentinela
    entorno, _, _ = crear_entorno_hibrido()
    caplog.set_level(logging.DEBUG)

    respuesta = entorno.consultar(solicitud)

    assert respuesta.status_code == 200
    assert caplog.records
    assert all(sentinela not in r.getMessage() for r in caplog.records)
