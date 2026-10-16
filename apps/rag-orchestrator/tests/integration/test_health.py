import httpx
import pytest
import respx
from fastapi.testclient import TestClient

from app.bootstrap import crear_app
from app.infrastructure.llm.openai_compatible_health import OpenAICompatibleLlmHealth
from tests.support.contract import assert_matches_spec
from tests.support.fakes import GeneradorTraceFijo, settings_de_prueba

URL_LLM = "http://llm-nativo.test:11434/v1"
SONDA = f"{URL_LLM}/models"


def _cliente(**cambios: object) -> TestClient:
    settings = settings_de_prueba(llm_provider="local", llm_base_url=URL_LLM, **cambios)
    sonda = OpenAICompatibleLlmHealth(settings.llm_base_url, settings.llm_health_timeout_ms)
    return TestClient(crear_app(settings, llm_health=sonda, trace_ids=GeneradorTraceFijo()))


FALLOS_DEL_LLM = {
    "conexion_rechazada": {"side_effect": httpx.ConnectError("rechazada")},
    "timeout": {"side_effect": httpx.ReadTimeout("sin respuesta")},
    "error_502": {"return_value": httpx.Response(502)},
}


@pytest.mark.ac("US-034", 4)
@pytest.mark.parametrize("fallo", FALLOS_DEL_LLM.values(), ids=FALLOS_DEL_LLM.keys())
def test_health_responde_503_sin_la_url_del_llm_cuando_el_llm_nativo_no_responde(fallo):
    with respx.mock(assert_all_called=False) as llm:
        llm.get(SONDA).mock(**fallo)
        respuesta = _cliente().get("/health")

    assert respuesta.status_code == 503
    assert_matches_spec("#/paths/~1health/get/responses/503", respuesta.json())
    assert respuesta.json() == {
        "error": "LOCAL_LLM_UNAVAILABLE",
        "message": "El modelo local no está disponible.",
        "traceId": "req_00000001",
    }
    assert "llm-nativo" not in respuesta.text


@pytest.mark.ac("US-034", 1)
def test_health_responde_200_validado_contra_el_spec_cuando_el_llm_responde():
    with respx.mock(assert_all_called=False) as llm:
        sonda = llm.get(SONDA).mock(return_value=httpx.Response(200, json={"data": []}))
        respuesta = _cliente().get("/health")

    assert sonda.call_count == 1
    assert respuesta.status_code == 200
    assert respuesta.text == '{"status":"ok"}'
    assert_matches_spec("#/components/schemas/HealthStatus", respuesta.json())


def test_health_usa_el_x_trace_id_recibido_cuando_cumple_el_formato():
    with respx.mock(assert_all_called=False) as llm:
        llm.get(SONDA).mock(side_effect=httpx.ConnectError("rechazada"))
        respuesta = _cliente().get("/health", headers={"X-Trace-Id": "req_abcdef12"})

    assert respuesta.status_code == 503
    assert respuesta.json()["traceId"] == "req_abcdef12"


def test_health_genera_un_trace_id_cuando_el_x_trace_id_recibido_no_cumple_el_formato():
    with respx.mock(assert_all_called=False) as llm:
        llm.get(SONDA).mock(side_effect=httpx.ConnectError("rechazada"))
        respuesta = _cliente().get("/health", headers={"X-Trace-Id": "no-valido"})

    assert respuesta.status_code == 503
    assert respuesta.json()["traceId"] == "req_00000001"
