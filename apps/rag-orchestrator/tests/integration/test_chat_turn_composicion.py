"""Cableado de `POST /chat/turn` en `crear_app` (US-259, US-034 AC-6): modo `fake`, modo `local` y composición incompleta.

Con ``LLM_PROVIDER=fake`` responde el ejemplo del contrato; con ``local`` el servicio real habla solo con ``LLM_BASE_URL``
(RN-12) y un LLM caído es ``503 LOCAL_LLM_UNAVAILABLE`` sin respuesta parcial.
"""

import json

import httpx
import respx
from fastapi.testclient import TestClient

from app.bootstrap import crear_app
from tests.support.catalogo_aplicabilidad import APL_1_0_0
from tests.support.chat import Q_CASO, solicitud_de_turno
from tests.support.fakes import GeneradorTraceFijo, RelojFijo, par_de_sesion, settings_de_prueba
from tests.support.recuperacion import EJEMPLOS
from tests.support.service_jwt import con_token_valido

URL_DEL_LLM = "http://host.docker.internal:11434/v1/chat/completions"


def _cliente(**cambios: object) -> TestClient:
    app = crear_app(
        settings_de_prueba(**cambios), trace_ids=GeneradorTraceFijo(), clock=RelojFijo()
    )
    return TestClient(app, raise_server_exceptions=False, headers=con_token_valido(par_de_sesion()))


def _ejemplo(nombre: str) -> dict:
    return json.loads((EJEMPLOS / nombre).read_text(encoding="utf-8"))


def test_chat_turn_responde_el_ejemplo_del_contrato_cuando_llm_provider_es_fake():
    cliente = _cliente(llm_provider="fake", fake_responses_path=EJEMPLOS)

    respuesta = cliente.post("/chat/turn", json=solicitud_de_turno(Q_CASO))

    assert respuesta.status_code == 200
    assert respuesta.json() == _ejemplo("chat-turn-caso-ok.json")


def test_chat_turn_responde_409_cuando_llm_provider_es_fake_y_el_catalogo_es_de_otra_version():
    cliente = _cliente(llm_provider="fake", fake_responses_path=EJEMPLOS)

    respuesta = cliente.post(
        "/chat/turn", json=solicitud_de_turno(version_del_catalogo="1999.01.0")
    )

    assert respuesta.status_code == 409
    assert respuesta.json()["error"] == "CATALOG_VERSION_MISMATCH"


def test_chat_turn_responde_503_local_llm_unavailable_cuando_el_llm_local_no_responde():
    cliente = _cliente()
    with respx.mock(assert_all_called=False) as llm:
        llamadas = llm.post(URL_DEL_LLM).mock(side_effect=httpx.ConnectError("sin conexión"))

        respuesta = cliente.post("/chat/turn", json=solicitud_de_turno(Q_CASO))

    assert respuesta.status_code == 503
    esperado = _ejemplo("chat-turn-llm-local-no-disponible.json")
    cuerpo = respuesta.json()
    assert {k: v for k, v in cuerpo.items() if k != "traceId"} == {
        k: v for k, v in esperado.items() if k != "traceId"
    }
    assert llamadas.call_count == 1  # sin reintento ni respuesta parcial
    assert Q_CASO not in respuesta.text


def test_chat_turn_responde_503_sin_llamar_al_llm_cuando_el_catalogo_montado_no_trae_terminos():
    cliente = _cliente(clinical_catalog_path=APL_1_0_0)
    with respx.mock(assert_all_called=False) as llm:
        llamadas = llm.post(URL_DEL_LLM).mock(return_value=httpx.Response(200, json={}))

        respuesta = cliente.post(
            "/chat/turn", json=solicitud_de_turno(Q_CASO, version_del_catalogo="1.0.0")
        )

    assert respuesta.status_code == 503
    assert respuesta.json()["error"] == "LOCAL_LLM_UNAVAILABLE"
    assert llamadas.call_count == 0
