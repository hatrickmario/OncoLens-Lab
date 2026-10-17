import json

import httpx
import pytest
import respx
from fastapi.testclient import TestClient

from app.bootstrap import crear_app
from tests.support.contract import RAIZ_REPOSITORIO, assert_matches_spec
from tests.support.fakes import GeneradorTraceFijo, RelojFijo, par_de_sesion, settings_de_prueba
from tests.support.service_jwt import con_token_valido

EJEMPLOS = RAIZ_REPOSITORIO / "contracts/examples"
RESPUESTA = "#/components/schemas/RagQueryInternalResponse"


def _ejemplo(nombre: str) -> dict:
    return json.loads((EJEMPLOS / nombre).read_text(encoding="utf-8"))


def _cliente_fake() -> TestClient:
    settings = settings_de_prueba(llm_provider="fake", fake_responses_path=EJEMPLOS)
    return TestClient(
        crear_app(settings, trace_ids=GeneradorTraceFijo(), clock=RelojFijo()),
        headers=con_token_valido(par_de_sesion()),
    )


@pytest.fixture
def llm_vigilado():
    """Cualquier llamada saliente (el LLM) queda registrada y responde 500."""
    with respx.mock(assert_all_called=False) as llm:
        llm.route().mock(return_value=httpx.Response(500))
        yield llm


@pytest.mark.ac("US-034", 6)
def test_rag_query_devuelve_rag_query_con_evidencia_validado_cuando_llega_la_pregunta_de_fixture_con_evidencia(
    llm_vigilado,
):
    respuesta = _cliente_fake().post("/rag/query", json=_ejemplo("rag-query-request.json"))

    assert respuesta.status_code == 200
    assert_matches_spec(RESPUESTA, respuesta.json())
    assert respuesta.json() == _ejemplo("rag-query-con-evidencia.json")
    assert not llm_vigilado.calls


@pytest.mark.ac("US-034", 6)
def test_rag_query_devuelve_rag_query_sin_evidencia_cuando_llega_la_pregunta_de_fixture_sin_evidencia(
    llm_vigilado,
):
    respuesta = _cliente_fake().post(
        "/rag/query", json=_ejemplo("rag-query-request-sin-evidencia.json")
    )

    assert respuesta.status_code == 200
    assert_matches_spec(RESPUESTA, respuesta.json())
    assert respuesta.json() == _ejemplo("rag-query-sin-evidencia.json")
    assert respuesta.json()["topRelevanceScore"] is None


@pytest.mark.ac("US-034", 6)
def test_rag_query_devuelve_sin_evidencia_cuando_la_pregunta_no_es_de_fixture(llm_vigilado):
    solicitud = {**_ejemplo("rag-query-request.json"), "query": "Pregunta que no es de fixture"}

    respuesta = _cliente_fake().post("/rag/query", json=solicitud)

    assert respuesta.status_code == 200
    assert respuesta.json() == _ejemplo("rag-query-sin-evidencia.json")


@pytest.mark.ac("US-034", 6)
def test_health_responde_200_sin_llamar_al_llm_cuando_llm_provider_es_fake(llm_vigilado):
    respuesta = _cliente_fake().get("/health")

    assert respuesta.status_code == 200
    assert respuesta.text == '{"status":"ok"}'
    assert_matches_spec("#/components/schemas/HealthStatus", respuesta.json())
    assert not llm_vigilado.calls


def test_rag_query_ignora_los_espacios_de_los_extremos_de_la_pregunta_al_elegir_el_fixture(
    llm_vigilado,
):
    base = _ejemplo("rag-query-request.json")
    solicitud = {**base, "query": f"  {base['query']}\n"}

    respuesta = _cliente_fake().post("/rag/query", json=solicitud)

    assert respuesta.json() == _ejemplo("rag-query-con-evidencia.json")


def test_rag_query_no_se_registra_cuando_llm_provider_es_local():
    settings = settings_de_prueba(llm_provider="local")

    respuesta = TestClient(crear_app(settings)).post(
        "/rag/query", json=_ejemplo("rag-query-request.json")
    )

    assert respuesta.status_code == 404
