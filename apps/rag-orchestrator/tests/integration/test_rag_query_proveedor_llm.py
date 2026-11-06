"""RN-12 en `/rag/query` (US-050): el proveedor del LLM sale de la clasificación de la petición, sin nube con datos reales.

El LLM local es el adapter real contra ``respx``; el de nube es ``LlmNubeFalso``, que cuenta invocaciones. Cada respuesta se
valida contra el spec del proveedor. Solo contenido sintético: ``dataClassification`` real es una etiqueta de la petición.
"""

import httpx
import pytest
import respx
from fastapi.testclient import TestClient

from app.bootstrap import crear_app
from tests.support.fakes import GeneradorTraceFijo, RelojFijo, par_de_sesion, settings_de_prueba
from tests.support.llm_nube_falso import LlmNubeFalso
from tests.support.recuperacion import Q_HER2, puertos_de_recuperacion, solicitud_de
from tests.support.service_jwt import con_token_valido

BASE_LLM = "http://llm-nativo.test:11434/v1"
URL_LLM = f"{BASE_LLM}/chat/completions"
CONTENIDO_OK = '{"options":[{"option":"Opción","claims":[{"text":"Razón","role":"principal","citations":["C1"]}]}]}'
LOCAL_OK = httpx.Response(200, json={"choices": [{"message": {"content": CONTENIDO_OK}}]})


def _cliente(nube: LlmNubeFalso, *, nube_habilitada: bool) -> TestClient:
    settings = settings_de_prueba(
        llm_provider="local",
        llm_allowed_hosts=("llm-nativo.test",),
        llm_base_url=BASE_LLM,
        llm_model="llm-test@1",
        llm_cloud_enabled=nube_habilitada,
    )
    app = crear_app(
        settings,
        trace_ids=GeneradorTraceFijo(),
        clock=RelojFijo(),
        recuperacion=puertos_de_recuperacion(),
        llm_nube=nube,
    )
    return TestClient(app, raise_server_exceptions=False, headers=con_token_valido(par_de_sesion()))


def _consulta(clasificacion: str) -> dict:
    return {**solicitud_de(Q_HER2), "dataClassification": clasificacion}


@pytest.mark.ac("US-050", 1)
def test_rag_query_responde_con_el_local_y_cero_invocaciones_a_la_nube_cuando_el_dato_es_real_y_la_nube_esta_habilitada():
    nube = LlmNubeFalso()
    with respx.mock(assert_all_called=False) as red:
        local = red.post(URL_LLM).mock(return_value=LOCAL_OK)

        respuesta = _cliente(nube, nube_habilitada=True).post(
            "/rag/query", json=_consulta("real_identificado")
        )

    assert respuesta.status_code == 200
    assert local.call_count == 1
    assert nube.invocaciones == 0
    assert respuesta.json()["meta"]["llmProvider"] == "local"


@pytest.mark.ac("US-050", 2)
@pytest.mark.parametrize("clasificacion", ["real_identificado", "real_anonimizado"])
def test_rag_query_responde_503_sin_invocar_a_la_nube_cuando_el_local_cae_con_dato_real(
    clasificacion,
):
    nube = LlmNubeFalso()
    with respx.mock(assert_all_called=False) as red:
        local = red.post(URL_LLM).mock(side_effect=httpx.ConnectError("sin ruta"))

        respuesta = _cliente(nube, nube_habilitada=True).post(
            "/rag/query", json=_consulta(clasificacion)
        )

    assert respuesta.status_code == 503
    assert respuesta.json()["error"] == "LOCAL_LLM_UNAVAILABLE"
    assert local.call_count == 1
    assert nube.invocaciones == 0


@pytest.mark.ac("US-050", 3)
def test_rag_query_responde_503_sin_invocar_a_la_nube_cuando_es_sintetico_y_la_nube_esta_deshabilitada():
    nube = LlmNubeFalso()
    with respx.mock(assert_all_called=False) as red:
        red.post(URL_LLM).mock(side_effect=httpx.ConnectError("sin ruta"))

        respuesta = _cliente(nube, nube_habilitada=False).post(
            "/rag/query", json=_consulta("sintetico")
        )

    assert respuesta.status_code == 503
    assert respuesta.json()["error"] == "LOCAL_LLM_UNAVAILABLE"
    assert nube.invocaciones == 0


def test_rag_query_usa_el_respaldo_en_la_nube_y_declara_nube_cuando_es_sintetico_la_nube_esta_habilitada_y_el_local_cae():
    nube = LlmNubeFalso()
    with respx.mock(assert_all_called=False) as red:
        red.post(URL_LLM).mock(side_effect=httpx.ConnectError("sin ruta"))

        respuesta = _cliente(nube, nube_habilitada=True).post(
            "/rag/query", json=_consulta("sintetico")
        )

    assert respuesta.status_code == 200
    assert nube.invocaciones == 1
    assert respuesta.json()["meta"]["llmProvider"] == "nube"


@pytest.mark.ac("US-050", 1)
def test_rag_query_conserva_los_modelos_de_recuperacion_y_verificacion_cuando_el_selector_elige_proveedor():
    with respx.mock(assert_all_called=False) as red:
        red.post(URL_LLM).mock(return_value=LOCAL_OK)
        con_real = (
            _cliente(LlmNubeFalso(), nube_habilitada=True)
            .post("/rag/query", json=_consulta("real_identificado"))
            .json()["meta"]
        )
        con_sintetico = (
            _cliente(LlmNubeFalso(), nube_habilitada=False)
            .post("/rag/query", json=_consulta("sintetico"))
            .json()["meta"]
        )

    for campo in ("embeddingModel", "rerankerModel", "nliModel"):
        assert con_real[campo] == con_sintetico[campo]
