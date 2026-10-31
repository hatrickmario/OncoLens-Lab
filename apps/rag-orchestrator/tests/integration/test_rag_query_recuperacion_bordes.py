"""Bordes de `POST /rag/query` en el tramo de recuperación (US-055 / L1D-106) que no son un AC de la historia."""

from dataclasses import replace

import pytest
from fastapi.testclient import TestClient

from app.prompts.rag_query import VERSION_DEL_PROMPT
from tests.support.recuperacion import (
    PARAMETROS_DE_PRUEBA,
    Q_HER2,
    Q_SIN,
    VERSION_DEL_CATALOGO_MONTADO,
    DetectorIdiomaFalso,
    LectorReleaseFalso,
    RerankerFalso,
    crear_entorno,
    solicitud_de,
)

RESPUESTA_401 = "#/paths/~1rag~1query/post/responses/401"
RESPUESTA_503 = "#/paths/~1rag~1query/post/responses/503"


def test_rag_query_delega_en_el_generador_solo_los_chunks_sobre_el_umbral_cuando_hay_evidencia():
    entorno = crear_entorno()

    respuesta = entorno.consultar(solicitud_de(Q_HER2))

    assert respuesta.status_code == 200
    assert entorno.generador.invocaciones == 1
    recuperacion = entorno.generador.recuperaciones[0]
    assert [c.chunk_id for c in recuperacion.chunks_sobre_umbral] == ["ch-m1-1", "ch-inj-1"]
    # ch-m1-1, ch-p1-1 y ch-inj-1 (sin el no vigente) menos ch-p1-1, que el filtro de mama no deja pasar: 2 candidatos.
    assert recuperacion.recuperados == 2


def test_rag_query_conserva_solo_rerank_top_n_candidatos_antes_del_umbral():
    entorno = crear_entorno(parametros=replace(PARAMETROS_DE_PRUEBA, rerank_top_n=1))

    entorno.consultar(solicitud_de(Q_HER2))

    recuperacion = entorno.generador.recuperaciones[0]
    assert [c.chunk_id for c in recuperacion.chunks_sobre_umbral] == ["ch-m1-1"]
    assert recuperacion.meta.retrievalParams.rerankTopN == 1


def test_rag_query_ignora_la_similitud_dense_alta_cuando_el_reranker_puntua_bajo_el_umbral():
    # ch-m1-1 tiene la mayor similitud dense entre los vigentes de mama, pero su puntaje de reranker es bajo.
    puntajes_bajos = {Q_HER2: {"ch-m1-1": 0.05, "ch-inj-1": 0.05}}
    entorno = crear_entorno(reranker=RerankerFalso(puntajes=puntajes_bajos))

    respuesta = entorno.consultar(solicitud_de(Q_HER2))

    cuerpo = respuesta.json()
    assert cuerpo["status"] == "sin_evidencia"
    assert cuerpo["retrievalStats"] == {"retrieved": 2, "aboveThreshold": 0}
    assert cuerpo["topRelevanceScore"] is None
    assert entorno.generador.invocaciones == 0


def test_rag_query_completa_meta_con_la_release_del_corpus_y_la_configuracion_cuando_responde_sin_evidencia():
    entorno = crear_entorno()

    meta = entorno.consultar(solicitud_de(Q_SIN)).json()["meta"]

    assert meta == {
        "queryLanguage": "es",
        "responseLanguage": "es",
        "llmProvider": "local",
        "llmModel": "llm-test@1",
        "embeddingModel": "embedder-test@1",
        "rerankerModel": "reranker-test@1",
        "nliModel": "nli-test@1",
        "promptVersion": VERSION_DEL_PROMPT,
        "catalogVersion": VERSION_DEL_CATALOGO_MONTADO,
        "corpusRelease": "rel-test-1",
        "corpusCutoffDate": "2026-09-30",
        "excludedSources": ["NCCN", "ESMO"],
        "retrievalParams": {
            "topK": 40,
            "rerankTopN": 10,
            "relevanceThreshold": 0.3,
            "retrievalMode": "dense",
            "fusion": "ninguna",
            "fusionParam": 0,
            "queryRewrite": {"applied": False, "reason": "no_disparado"},
        },
        "latencyMs": 0,
    }


def test_rag_query_responde_sin_evidencia_con_una_limitacion_estructural_cuando_ningun_chunk_supera_el_umbral():
    entorno = crear_entorno()

    cuerpo = entorno.consultar(solicitud_de(Q_SIN)).json()

    assert [limitacion["origin"] for limitacion in cuerpo["limitations"]] == ["estructural"]
    assert cuerpo["retrievalStats"] == {"retrieved": 2, "aboveThreshold": 0}


def test_rag_query_embebe_el_resumen_del_contexto_sin_el_pseudo_paciente_cuando_busca_evidencia():
    entorno = crear_entorno()
    solicitud = solicitud_de(Q_HER2)

    entorno.consultar(solicitud)

    pregunta, resumen = entorno.embedder.textos
    assert pregunta == Q_HER2
    assert "mama" in resumen and "HER2" in resumen
    assert solicitud["clinicalContext"]["pseudoPatientId"] not in " ".join(entorno.embedder.textos)


def test_rag_query_responde_503_retrieval_unavailable_cuando_el_catalogo_del_corpus_falla():
    entorno = crear_entorno(lector_release=LectorReleaseFalso(error=RuntimeError("catálogo caído")))

    respuesta = entorno.consultar(solicitud_de(Q_HER2))

    assert respuesta.status_code == 503
    assert respuesta.json()["error"] == "RETRIEVAL_UNAVAILABLE"
    assert entorno.generador.invocaciones == 0


class _RerankerRoto(RerankerFalso):
    def __init__(self, puntajes: list[float]) -> None:
        super().__init__()
        self._respuesta = puntajes

    def puntuar(self, pregunta, candidatos):
        return self._respuesta


@pytest.mark.parametrize(
    "puntajes",
    [[1.2, 0.5], [0.5], None, "0.5", [None, 0.5], ["0.5", "0.5"], [True, 0.5], [float("nan"), 0.5]],
)
def test_rag_query_responde_503_retrieval_unavailable_cuando_el_reranker_rompe_su_contrato(
    puntajes,
):
    entorno = crear_entorno(reranker=_RerankerRoto(puntajes))

    respuesta = entorno.consultar(solicitud_de(Q_HER2))

    assert respuesta.status_code == 503
    assert respuesta.json()["error"] == "RETRIEVAL_UNAVAILABLE"
    assert entorno.generador.invocaciones == 0


def test_rag_query_responde_503_retrieval_unavailable_sin_eco_cuando_falla_el_detector_de_idioma():
    fallo = RuntimeError(f"detector roto al leer {Q_HER2!r}")
    entorno = crear_entorno(detector_idioma=DetectorIdiomaFalso(error=fallo))
    solicitud = solicitud_de(Q_HER2)

    respuesta = entorno.consultar(solicitud)

    assert respuesta.status_code == 503
    assert respuesta.json()["error"] == "RETRIEVAL_UNAVAILABLE"
    assert Q_HER2 not in respuesta.text
    assert entorno.embedder.invocaciones == entorno.buscador.invocaciones == 0
    assert entorno.generador.invocaciones == 0


@pytest.mark.parametrize(
    "tipo",
    ['mama" or is_current == false or "', "   ", "próstata", "Mama", "mama ductal"],
)
def test_rag_query_responde_422_tipo_cancer_no_registrado_sin_buscar_cuando_el_tipo_no_es_utilizable(
    tipo,
):
    entorno = crear_entorno()

    respuesta = entorno.consultar(solicitud_de(Q_HER2, tipo_de_cancer=tipo))

    assert respuesta.status_code == 422
    assert respuesta.json()["error"] == "TIPO_CANCER_NO_REGISTRADO"
    assert entorno.buscador.invocaciones == 0


def test_rag_query_responde_401_sin_tocar_ningun_puerto_cuando_falta_el_jwt_de_servicio():
    entorno = crear_entorno()
    sin_token = TestClient(entorno.cliente.app, raise_server_exceptions=False)

    respuesta = sin_token.post("/rag/query", json=solicitud_de(Q_HER2))

    assert respuesta.status_code == 401
    assert entorno.embedder.invocaciones == entorno.buscador.invocaciones == 0
    assert entorno.reranker.invocaciones == entorno.generador.invocaciones == 0
