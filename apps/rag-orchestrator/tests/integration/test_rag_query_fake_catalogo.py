"""`LLM_PROVIDER=fake` también respeta la versión del catálogo (US-041 AC-2): Compose, CI y E2E ven el mismo 409."""

import json

import pytest
from fastapi.testclient import TestClient

from app.bootstrap import crear_app
from tests.support.contract import RAIZ_REPOSITORIO, assert_matches_spec
from tests.support.fakes import GeneradorTraceFijo, RelojFijo, par_de_sesion, settings_de_prueba
from tests.support.recuperacion import ejemplo_con_catalogo_montado
from tests.support.service_jwt import con_token_valido

EJEMPLOS = RAIZ_REPOSITORIO / "contracts/examples"
RESPUESTA_409 = "#/paths/~1rag~1query/post/responses/409"
VERSION_AJENA = "9.9.9-ajena"


def _cliente_fake() -> TestClient:
    settings = settings_de_prueba(llm_provider="fake", fake_responses_path=EJEMPLOS)
    return TestClient(
        crear_app(settings, trace_ids=GeneradorTraceFijo(), clock=RelojFijo()),
        headers=con_token_valido(par_de_sesion()),
    )


@pytest.mark.ac("US-041", 2)
def test_fake_responde_409_cuando_el_catalogo_es_otro():
    solicitud = {
        **ejemplo_con_catalogo_montado("rag-query-request.json"),
        "catalogVersion": VERSION_AJENA,
    }

    respuesta = _cliente_fake().post("/rag/query", json=solicitud)

    assert respuesta.status_code == 409
    cuerpo = respuesta.json()
    assert_matches_spec(RESPUESTA_409, cuerpo)
    ejemplo = json.loads(
        (EJEMPLOS / "rag-catalog-version-mismatch.json").read_text(encoding="utf-8")
    )
    assert cuerpo == {**ejemplo, "traceId": solicitud["traceId"]}
    assert VERSION_AJENA not in respuesta.text


def test_fake_responde_200_cuando_el_catalogo_coincide():
    respuesta = _cliente_fake().post(
        "/rag/query", json=ejemplo_con_catalogo_montado("rag-query-request.json")
    )

    assert respuesta.status_code == 200
