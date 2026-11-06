"""`/rag/query` entrega al LLM las instrucciones como `system` y los datos delimitados como `user` (US-057, SEG-13)."""

import json

import httpx
import pytest
import respx
from fastapi.testclient import TestClient

from app.bootstrap import crear_app
from app.infrastructure.llm.fabrica_local import crear_generador_local
from tests.support.fakes import GeneradorTraceFijo, RelojFijo, par_de_sesion, settings_de_prueba
from tests.support.prompt_separado import bloques
from tests.support.recuperacion import Q_HER2, puertos_de_recuperacion, solicitud_de
from tests.support.service_jwt import con_token_valido

BASE_LLM = "http://llm-nativo.test:11434/v1"
URL_LLM = f"{BASE_LLM}/chat/completions"
CONTENIDO_OK = '{"options":[{"option":"Opción","claims":[{"text":"Razón","role":"principal","citations":["C1"]}]}]}'


def _cliente() -> TestClient:
    settings = settings_de_prueba(
        llm_provider="local",
        llm_allowed_hosts=("llm-nativo.test",),
        llm_base_url=BASE_LLM,
        llm_model="llm-test@1",
    )
    app = crear_app(
        settings,
        trace_ids=GeneradorTraceFijo(),
        clock=RelojFijo(),
        recuperacion=puertos_de_recuperacion(),
        generador=crear_generador_local(settings),
    )
    return TestClient(app, raise_server_exceptions=False, headers=con_token_valido(par_de_sesion()))


@pytest.mark.ac("US-057", 1)
def test_el_llm_recibe_system_y_user_y_prompt_version_empieza_por_rag_query_0_10_0_cuando_rag_query_genera():
    """[US-057 AC-1]"""
    with respx.mock(assert_all_called=False) as red:
        llm = red.post(URL_LLM).mock(
            return_value=httpx.Response(
                200, json={"choices": [{"message": {"content": CONTENIDO_OK}}]}
            )
        )

        respuesta = _cliente().post("/rag/query", json=solicitud_de(Q_HER2))

    assert respuesta.status_code == 200
    mensajes = json.loads(llm.calls[0].request.content)["messages"]
    assert [m["role"] for m in mensajes] == ["system", "user"]
    sistema, usuario = mensajes[0]["content"], mensajes[1]["content"]
    assert Q_HER2 not in sistema and bloques(sistema) == []
    etiquetas = [b.etiqueta for b in bloques(usuario)]
    assert etiquetas.count("question") == 1 and etiquetas.count("document") >= 1
    assert respuesta.json()["meta"]["promptVersion"].startswith("rag-query@0.10.0")
