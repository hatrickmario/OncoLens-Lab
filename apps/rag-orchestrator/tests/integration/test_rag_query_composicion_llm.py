"""Composición de la generación en `app/bootstrap.py` (L1D-275, tarea 2.9): RN-12, `503` sin *fallback*.

``crear_generador_local()`` enlaza el LLM nativo local; sin él (producción hasta L1D-180) la rama con evidencia sigue en
``503``. Todo el HTTP saliente va por ``respx``: un host no declarado hace fallar el test.
"""

import httpx
import respx
from fastapi.testclient import TestClient

from app.bootstrap import PuertosDeRecuperacion, crear_app, crear_generador_local
from tests.support.contract import assert_matches_spec
from tests.support.fakes import GeneradorTraceFijo, RelojFijo, par_de_sesion, settings_de_prueba
from tests.support.recuperacion import (
    Q_HER2,
    puertos_de_recuperacion,
    solicitud_de,
)
from tests.support.service_jwt import con_token_valido

BASE_LLM = "http://llm-nativo.test:11434/v1"
URL_LLM = f"{BASE_LLM}/chat/completions"
RESPUESTA = "#/components/schemas/RagQueryInternalResponse"
RESPUESTA_503 = "#/paths/~1rag~1query/post/responses/503"
CONTENIDO_OK = '{"options":[{"option":"Opción","rationale":"Razón","citedChunkIds":["ch-m1-1"]}]}'


def _puertos() -> PuertosDeRecuperacion:
    return puertos_de_recuperacion()


def _cliente(*, con_llm_local: bool) -> TestClient:
    settings = settings_de_prueba(
        llm_provider="local",
        llm_base_url=BASE_LLM,
        llm_model="llm-test@1",
        nli_model="nli-test@1",
        prompt_version="rag-query@test",
    )
    app = crear_app(
        settings,
        trace_ids=GeneradorTraceFijo(),
        clock=RelojFijo(),
        recuperacion=_puertos(),
        generador=crear_generador_local(settings) if con_llm_local else None,
    )
    return TestClient(app, raise_server_exceptions=False, headers=con_token_valido(par_de_sesion()))


def test_rag_query_responde_con_evidencia_cuando_el_llm_local_devuelve_una_opcion_valida():
    with respx.mock(assert_all_called=False) as red:
        llm = red.post(URL_LLM).mock(
            return_value=httpx.Response(
                200, json={"choices": [{"message": {"content": CONTENIDO_OK}}]}
            )
        )

        respuesta = _cliente(con_llm_local=True).post("/rag/query", json=solicitud_de(Q_HER2))

    assert respuesta.status_code == 200
    assert_matches_spec(RESPUESTA, respuesta.json())
    assert llm.call_count == 1
    assert respuesta.json()["meta"]["llmProvider"] == "local"


def test_rag_query_responde_503_local_llm_unavailable_sin_fallback_cuando_el_llm_local_no_conecta():
    with respx.mock(assert_all_called=False) as red:
        llm = red.post(URL_LLM).mock(side_effect=httpx.ConnectError("sin ruta"))

        respuesta = _cliente(con_llm_local=True).post("/rag/query", json=solicitud_de(Q_HER2))

    assert respuesta.status_code == 503
    assert_matches_spec(RESPUESTA_503, respuesta.json())
    assert respuesta.json()["error"] == "LOCAL_LLM_UNAVAILABLE"
    assert llm.call_count == 1  # una sola llamada y a ningún otro host


def test_rag_query_responde_503_sin_llamar_al_llm_cuando_produccion_no_enlaza_el_generador_local():
    with respx.mock(assert_all_called=False) as red:
        llm = red.post(URL_LLM).mock(return_value=httpx.Response(200, json={}))

        respuesta = _cliente(con_llm_local=False).post("/rag/query", json=solicitud_de(Q_HER2))

    assert respuesta.status_code == 503
    assert respuesta.json()["error"] == "LOCAL_LLM_UNAVAILABLE"
    assert llm.call_count == 0
