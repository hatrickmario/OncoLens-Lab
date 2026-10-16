import json
import logging

import pytest
from fastapi.testclient import TestClient

from app.bootstrap import crear_app
from tests.support.contract import RAIZ_REPOSITORIO, assert_matches_spec
from tests.support.fakes import GeneradorTraceFijo, par_de_sesion, settings_de_prueba
from tests.support.service_jwt import con_token_valido

EJEMPLOS = RAIZ_REPOSITORIO / "contracts/examples"
RESPUESTA_422 = "#/paths/~1rag~1query/post/responses/422"
CENTINELA = "SENTINELA-422-SINTETICA"


def _cliente() -> TestClient:
    settings = settings_de_prueba(llm_provider="fake", fake_responses_path=EJEMPLOS)
    return TestClient(crear_app(settings, trace_ids=GeneradorTraceFijo()), headers=con_token_valido(par_de_sesion()))


def _solicitud_invalida() -> dict:
    base = json.loads((EJEMPLOS / "rag-query-request.json").read_text(encoding="utf-8"))
    return {**base, "maxOptions": 99, "dataClassification": CENTINELA, "campoAjeno": CENTINELA}


@pytest.mark.ac("US-034", 6)
def test_rag_query_responde_422_cuerpo_invalido_validado_y_sin_eco_del_cuerpo_cuando_el_request_no_cumple_el_contrato(
    caplog,
):
    caplog.set_level(logging.DEBUG)

    respuesta = _cliente().post("/rag/query", json=_solicitud_invalida())

    assert respuesta.status_code == 422
    assert_matches_spec(RESPUESTA_422, respuesta.json())
    cuerpo = respuesta.json()
    assert cuerpo["error"] == "CUERPO_INVALIDO"
    assert cuerpo["traceId"] == "req_00000001"
    assert {tuple(d["loc"]) for d in cuerpo["detail"]} >= {
        ("body", "maxOptions"),
        ("body", "dataClassification"),
        ("body", "campoAjeno"),
    }
    assert all(set(d) == {"loc", "msg", "type"} for d in cuerpo["detail"])
    assert CENTINELA not in respuesta.text
    assert CENTINELA not in caplog.text


def test_rag_query_usa_el_x_trace_id_recibido_en_el_422_cuando_cumple_el_formato():
    respuesta = _cliente().post(
        "/rag/query", json=_solicitud_invalida(), headers={"X-Trace-Id": "req_abcdef12"}
    )

    assert respuesta.status_code == 422
    assert respuesta.json().get("traceId") == "req_abcdef12"
