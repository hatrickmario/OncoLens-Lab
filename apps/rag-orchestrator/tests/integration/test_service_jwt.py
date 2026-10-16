import json
import logging

import pytest
from fastapi.testclient import TestClient

from app.bootstrap import crear_app
from app.schemas.generated.models import RagQueryInternalResponse
from tests.support.contract import RAIZ_REPOSITORIO, assert_matches_spec, operaciones_con_jwt_de_servicio
from tests.support.fakes import (
    ConsultaEvidenciaContadora,
    GeneradorTraceFijo,
    RelojFijo,
    par_de_sesion,
    settings_de_prueba,
)
from tests.support.service_jwt import VARIANTES_INVALIDAS, cabecera_bearer, con_token_valido, token_es256

EJEMPLOS = RAIZ_REPOSITORIO / "contracts/examples"
RESPUESTA = "#/components/schemas/RagQueryInternalResponse"
RESPUESTA_401 = "#/paths/~1rag~1query/post/responses/401"
COOKIE_DE_SESION = "SENTINELA-COOKIE-DE-SESION"


def _ejemplo(nombre: str) -> dict:
    return json.loads((EJEMPLOS / nombre).read_text(encoding="utf-8"))


def _consulta() -> ConsultaEvidenciaContadora:
    return ConsultaEvidenciaContadora(
        RagQueryInternalResponse.model_validate(_ejemplo("rag-query-con-evidencia.json"))
    )


def _cliente(consulta: ConsultaEvidenciaContadora, **cambios: object) -> TestClient:
    settings = settings_de_prueba(llm_provider="fake", fake_responses_path=EJEMPLOS, **cambios)
    app = crear_app(settings, trace_ids=GeneradorTraceFijo(), clock=RelojFijo(), consulta=consulta)
    # Sin relanzar excepciones del servidor: un esqueleto o un fallo se ve como 500, no como error del test.
    return TestClient(app, raise_server_exceptions=False)


@pytest.mark.ac("US-054", 1)
def test_rag_query_responde_200_validado_cuando_el_jwt_de_servicio_es_valido():
    consulta = _consulta()

    respuesta = _cliente(consulta).post(
        "/rag/query", json=_ejemplo("rag-query-request.json"), headers=con_token_valido(par_de_sesion())
    )

    assert respuesta.status_code == 200
    assert_matches_spec(RESPUESTA, respuesta.json())
    assert consulta.invocaciones == 1


def _afirmar_401_de_contrato(respuesta) -> None:
    assert respuesta.status_code == 401
    assert_matches_spec(RESPUESTA_401, respuesta.json())
    assert respuesta.json() == {
        "error": "TOKEN_SERVICIO_INVALIDO",
        "message": "El token de servicio falta o no es válido.",
        "traceId": "req_00000001",
    }
    assert respuesta.headers["WWW-Authenticate"] == "Bearer"


@pytest.mark.ac("US-054", 2)
@pytest.mark.parametrize("construir", VARIANTES_INVALIDAS.values(), ids=VARIANTES_INVALIDAS.keys())
def test_rag_query_responde_401_validado_sin_invocar_al_llm_cuando_el_jwt_falta_o_es_invalido(construir):
    consulta = _consulta()

    respuesta = _cliente(consulta).post(
        "/rag/query", json=_ejemplo("rag-query-request.json"), headers=construir(par_de_sesion())
    )

    _afirmar_401_de_contrato(respuesta)
    assert consulta.invocaciones == 0


@pytest.mark.ac("US-054", 3)
def test_rag_query_responde_401_y_no_registra_la_cookie_cuando_llega_oncolens_session_sin_jwt(caplog):
    caplog.set_level(logging.DEBUG)
    consulta = _consulta()

    respuesta = _cliente(consulta).post(
        "/rag/query",
        json=_ejemplo("rag-query-request.json"),
        headers={"Cookie": f"oncolens_session={COOKIE_DE_SESION}"},
    )

    _afirmar_401_de_contrato(respuesta)
    assert consulta.invocaciones == 0
    assert "token_servicio_invalido" in caplog.text
    assert COOKIE_DE_SESION not in caplog.text
    assert COOKIE_DE_SESION not in respuesta.text


@pytest.mark.ac("US-054", 5)
def test_rag_query_responde_401_cuando_la_vida_del_jwt_supera_service_jwt_ttl_seconds(caplog):
    caplog.set_level(logging.DEBUG)
    consulta = _consulta()
    token = token_es256(par_de_sesion(), vida=3600)

    respuesta = _cliente(consulta, service_jwt_ttl_seconds=60).post(
        "/rag/query", json=_ejemplo("rag-query-request.json"), headers=cabecera_bearer(token)
    )

    _afirmar_401_de_contrato(respuesta)
    assert consulta.invocaciones == 0
    assert "vida_maxima" in caplog.text
    assert token not in caplog.text


def test_rag_query_responde_401_y_no_422_cuando_falta_el_jwt_de_servicio_y_el_cuerpo_es_invalido():
    consulta = _consulta()
    cuerpo_invalido = {**_ejemplo("rag-query-request.json"), "maxOptions": 99, "campoAjeno": "x"}

    respuesta = _cliente(consulta).post("/rag/query", json=cuerpo_invalido)

    _afirmar_401_de_contrato(respuesta)
    assert "detail" not in respuesta.json()
    assert consulta.invocaciones == 0


def test_rag_query_responde_401_y_no_422_cuando_falta_el_jwt_de_servicio_y_el_cuerpo_no_es_json():
    respuesta = _cliente(_consulta()).post(
        "/rag/query", content=b"{no es json", headers={"Content-Type": "application/json"}
    )

    _afirmar_401_de_contrato(respuesta)


def test_rag_query_responde_401_cuando_el_esquema_de_authorization_no_es_bearer():
    respuesta = _cliente(_consulta()).post(
        "/rag/query", json=_ejemplo("rag-query-request.json"), headers={"Authorization": "Basic dXNlcjpwYXNz"}
    )

    _afirmar_401_de_contrato(respuesta)


def test_rag_query_ignora_la_cookie_de_sesion_y_responde_200_cuando_el_jwt_de_servicio_es_valido():
    consulta = _consulta()

    respuesta = _cliente(consulta).post(
        "/rag/query",
        json=_ejemplo("rag-query-request.json"),
        headers={**con_token_valido(par_de_sesion()), "Cookie": f"oncolens_session={COOKIE_DE_SESION}"},
    )

    assert respuesta.status_code == 200
    assert consulta.invocaciones == 1


def test_health_responde_200_sin_jwt_de_servicio():
    respuesta = _cliente(_consulta()).get("/health")

    assert respuesta.status_code == 200
    assert_matches_spec("#/components/schemas/HealthStatus", respuesta.json())


def _rutas_de(app) -> list:
    """Rutas de los routers incluidos (FastAPI los agrupa en `_IncludedRouter`, que expone `original_router`)."""
    return [ruta for incluido in app.routes for ruta in incluido.original_router.routes]


@pytest.mark.ac("US-054", 2)
def test_toda_ruta_registrada_con_security_service_jwt_responde_401_sin_authorization_y_con_cuerpo_invalido():
    settings = settings_de_prueba(llm_provider="fake", fake_responses_path=EJEMPLOS)
    app = crear_app(settings, trace_ids=GeneradorTraceFijo(), clock=RelojFijo(), consulta=_consulta())
    cliente = TestClient(app, raise_server_exceptions=False)
    registradas = {(metodo, ruta.path) for ruta in _rutas_de(app) for metodo in ruta.methods}
    protegidas = [op for op in operaciones_con_jwt_de_servicio() if op in registradas]

    assert ("POST", "/rag/query") in protegidas
    for metodo, ruta in protegidas:
        respuesta = cliente.request(metodo, ruta, json={"cuerpo": "invalido"})
        assert respuesta.status_code == 401, f"{metodo} {ruta} no exige el JWT de servicio"
        assert respuesta.json()["error"] == "TOKEN_SERVICIO_INVALIDO"
    assert ("GET", "/health") not in operaciones_con_jwt_de_servicio()
