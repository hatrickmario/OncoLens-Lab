"""RN-12 en `POST /chat/turn` (US-050, `[S6 resp. 8]`): el chat aplica el mismo selector de proveedor que `/rag/query`.

El servicio del turno es el de producción compuesto por ``crear_app``; el LLM local es el adapter real contra ``respx`` y el
de nube es ``LlmNubeFalso``, que cuenta invocaciones. Cada respuesta se valida contra el spec del proveedor (US-214).
Solo contenido sintético: ``dataClassification`` real es una etiqueta de la petición.
"""

import json

import httpx
import pytest
import respx
from fastapi.testclient import TestClient

from app.bootstrap import crear_app
from tests.support.chat import Q_CASO, Q_SIN_REGLA, solicitud_de_turno
from tests.support.fakes import GeneradorTraceFijo, RelojFijo, par_de_sesion, settings_de_prueba
from tests.support.llm_chat_falso import ESCENARIOS
from tests.support.llm_nube_falso import LlmNubeFalso
from tests.support.recuperacion import EJEMPLOS
from tests.support.service_jwt import con_token_valido

URL_DEL_LLM = "http://host.docker.internal:11434/v1/chat/completions"
GENERACION_OK = ESCENARIOS["CHAT-OK"]["generacion"]
LOCAL_OK = httpx.Response(200, json={"choices": [{"message": {"content": GENERACION_OK}}]})


class _NubeDelChat(LlmNubeFalso):
    """La nube falsa responde con la generación válida del chat, para que el turno complete."""

    async def completar_json(self, usuario, esquema, *, sistema=None):
        await super().completar_json(usuario, esquema, sistema=sistema)
        return GENERACION_OK


def _cliente(nube: LlmNubeFalso, *, nube_habilitada: bool) -> TestClient:
    settings = settings_de_prueba(llm_cloud_enabled=nube_habilitada)
    app = crear_app(settings, trace_ids=GeneradorTraceFijo(), clock=RelojFijo(), llm_nube=nube)
    return TestClient(app, raise_server_exceptions=False, headers=con_token_valido(par_de_sesion()))


def _turno(pregunta: str, clasificacion: str, **cambios) -> dict:
    return {**solicitud_de_turno(pregunta, **cambios), "dataClassification": clasificacion}


@pytest.mark.ac("US-050", 2)
def test_chat_turn_responde_503_sin_invocar_a_la_nube_ni_guardar_el_hilo_cuando_el_local_cae_con_dato_real():
    nube = LlmNubeFalso()
    cliente = _cliente(nube, nube_habilitada=True)
    with respx.mock(assert_all_called=False) as red:
        local = red.post(URL_DEL_LLM).mock(side_effect=httpx.ConnectError("sin ruta"))

        respuesta = cliente.post("/chat/turn", json=_turno(Q_SIN_REGLA, "real_identificado"))
        siguiente = cliente.post(
            "/chat/turn", json=_turno(Q_CASO, "real_identificado", rehidratacion=None)
        )

    assert respuesta.status_code == 503
    esperado = json.loads((EJEMPLOS / "chat-turn-llm-local-no-disponible.json").read_text("utf-8"))
    assert respuesta.json()["error"] == esperado["error"]
    assert respuesta.json()["message"] == esperado["message"]
    assert local.call_count == 1
    assert nube.invocaciones == 0
    assert siguiente.status_code == 404  # el turno fallido no dejó hilo


@pytest.mark.ac("US-050", 1)
def test_chat_turn_declara_el_proveedor_local_y_no_toca_la_nube_cuando_el_dato_es_real_y_la_nube_esta_habilitada():
    nube = LlmNubeFalso()
    with respx.mock(assert_all_called=False) as red:
        local = red.post(URL_DEL_LLM).mock(return_value=LOCAL_OK)

        respuesta = _cliente(nube, nube_habilitada=True).post(
            "/chat/turn", json=_turno(Q_CASO, "real_identificado")
        )

    assert respuesta.status_code == 200
    assert local.call_count >= 1
    assert nube.invocaciones == 0
    assert respuesta.json()["llmProvider"] == "local"


def test_chat_turn_usa_el_respaldo_en_la_nube_y_declara_nube_cuando_es_sintetico_la_nube_esta_habilitada_y_el_local_cae():
    nube = _NubeDelChat()
    with respx.mock(assert_all_called=False) as red:
        red.post(URL_DEL_LLM).mock(side_effect=httpx.ConnectError("sin ruta"))

        respuesta = _cliente(nube, nube_habilitada=True).post(
            "/chat/turn", json=_turno(Q_CASO, "sintetico")
        )

    assert respuesta.status_code == 200
    assert nube.invocaciones >= 1
    assert respuesta.json()["llmProvider"] == "nube"
