"""Composición de `/rag/query` con `LLM_PROVIDER=local` (US-055 / L1D-106, tarea 2.12)."""

import logging

import pytest
from fastapi.testclient import TestClient

from app.bootstrap import ConfiguracionDeRecuperacionIncompleta, PuertosDeRecuperacion, crear_app
from tests.support.contract import assert_matches_spec
from tests.support.fakes import GeneradorTraceFijo, RelojFijo, par_de_sesion, settings_de_prueba
from tests.support.recuperacion import (
    EJEMPLOS,
    Q_HER2,
    Q_SIN,
    BuscadorFalso,
    DetectorIdiomaFalso,
    EmbedderFalso,
    LectorReleaseFalso,
    RerankerFalso,
    solicitud_de,
)
from tests.support.service_jwt import con_token_valido

CLAVES_DE_RECUPERACION = {
    "relevance_threshold": "RELEVANCE_THRESHOLD",
    "retrieval_top_k": "RETRIEVAL_TOP_K",
    "rerank_top_n": "RERANK_TOP_N",
    "nli_model": "NLI_MODEL",
    "prompt_version": "PROMPT_VERSION",
}


def _puertos() -> PuertosDeRecuperacion:
    return PuertosDeRecuperacion(
        detector_idioma=DetectorIdiomaFalso(),
        embedder=EmbedderFalso(),
        buscador=BuscadorFalso(),
        reranker=RerankerFalso(),
        lector_release=LectorReleaseFalso(),
    )


def _settings_locales(**cambios: object):
    valores: dict[str, object] = {
        "llm_provider": "local",
        "relevance_threshold": 0.30,
        "retrieval_top_k": 40,
        "rerank_top_n": 10,
        "nli_model": "nli-test@1",
        "prompt_version": "rag-query@test",
        **cambios,
    }
    return settings_de_prueba(**valores)


def _cliente(**cambios: object) -> TestClient:
    app = crear_app(
        _settings_locales(**cambios),
        trace_ids=GeneradorTraceFijo(),
        clock=RelojFijo(),
        recuperacion=_puertos(),
    )
    return TestClient(app, raise_server_exceptions=False, headers=con_token_valido(par_de_sesion()))


def test_rag_query_responde_503_local_llm_unavailable_validado_cuando_hay_evidencia_y_la_generacion_aun_no_existe():
    respuesta = _cliente().post("/rag/query", json=solicitud_de(Q_HER2))

    assert respuesta.status_code == 503
    assert_matches_spec("#/paths/~1rag~1query/post/responses/503", respuesta.json())
    assert respuesta.json()["error"] == "LOCAL_LLM_UNAVAILABLE"


def test_rag_query_registra_generacion_no_implementada_con_el_trace_id_cuando_el_generador_provisional_responde_503(
    caplog,
):
    solicitud = solicitud_de(Q_HER2)
    caplog.set_level(logging.INFO)

    _cliente().post("/rag/query", json=solicitud)

    mensajes = [r.getMessage() for r in caplog.records]
    assert f"event=generacion_no_implementada traceId={solicitud['traceId']}" in mensajes


def test_rag_query_responde_sin_evidencia_validado_cuando_la_composicion_local_no_encuentra_evidencia():
    respuesta = _cliente().post("/rag/query", json=solicitud_de(Q_SIN))

    assert respuesta.status_code == 200
    assert_matches_spec("#/components/schemas/RagQueryInternalResponse", respuesta.json())
    assert respuesta.json()["status"] == "sin_evidencia"


@pytest.mark.parametrize("campo", sorted(CLAVES_DE_RECUPERACION))
def test_arranque_falla_nombrando_la_clave_cuando_falta_un_valor_de_recuperacion(campo):
    with pytest.raises(ConfiguracionDeRecuperacionIncompleta) as error:
        _cliente(**{campo: None})

    assert CLAVES_DE_RECUPERACION[campo] in str(error.value)


@pytest.mark.parametrize("campo", ["relevance_threshold", "retrieval_top_k", "rerank_top_n"])
def test_arranque_falla_nombrando_la_clave_cuando_llm_provider_es_local_sin_puertos_y_falta_un_valor(
    campo,
):
    with pytest.raises(ConfiguracionDeRecuperacionIncompleta) as error:
        crear_app(_settings_locales(**{campo: None}), clock=RelojFijo())

    assert CLAVES_DE_RECUPERACION[campo] in str(error.value)


def test_rag_query_sigue_respondiendo_el_fixture_sin_exigir_la_configuracion_de_recuperacion_cuando_llm_provider_es_fake():
    app = crear_app(
        settings_de_prueba(llm_provider="fake", fake_responses_path=EJEMPLOS),
        recuperacion=_puertos(),
        clock=RelojFijo(),
    )
    cliente = TestClient(app, headers=con_token_valido(par_de_sesion()))

    respuesta = cliente.post("/rag/query", json=solicitud_de(Q_HER2))

    assert respuesta.status_code == 200
    assert respuesta.json()["status"] == "con_evidencia"
    assert respuesta.json()["meta"]["rerankerModel"] == "reranker-local-ejemplo"
