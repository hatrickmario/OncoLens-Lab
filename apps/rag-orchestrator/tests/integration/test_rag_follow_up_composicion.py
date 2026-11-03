"""Composición de `/rag/follow-up` (US-218): modo fake, 401 sin JWT de servicio y fallo cerrado sin bordes reales."""

import json

from fastapi.testclient import TestClient

from app.bootstrap import crear_app
from app.infrastructure.catalogo_clinico.sinonimos import cargar_terminos_por_tipo
from tests.support.contract import CATALOGOS
from tests.support.fakes import GeneradorTraceFijo, RelojFijo, par_de_sesion, settings_de_prueba
from tests.support.recuperacion import EJEMPLOS
from tests.support.seguimiento import solicitud_de_seguimiento
from tests.support.service_jwt import con_token_valido


def _cliente(con_jwt: bool = True, **ajustes: object) -> TestClient:
    app = crear_app(
        settings_de_prueba(**ajustes), trace_ids=GeneradorTraceFijo(), clock=RelojFijo()
    )
    cabeceras = con_token_valido(par_de_sesion()) if con_jwt else {}
    return TestClient(app, headers=cabeceras, raise_server_exceptions=False)


def test_rag_follow_up_devuelve_el_ejemplo_del_contrato_cuando_llm_provider_es_fake():
    cliente = _cliente(llm_provider="fake", fake_responses_path=EJEMPLOS)

    respuesta = cliente.post("/rag/follow-up", json=solicitud_de_seguimiento())

    esperado = json.loads((EJEMPLOS / "rag-follow-up-response.json").read_text(encoding="utf-8"))
    assert respuesta.status_code == 200 and respuesta.json() == esperado


def test_rag_follow_up_responde_401_sin_llamar_al_seguimiento_cuando_falta_el_jwt_de_servicio():
    cliente = _cliente(con_jwt=False, llm_provider="fake", fake_responses_path=EJEMPLOS)

    respuesta = cliente.post("/rag/follow-up", json=solicitud_de_seguimiento())

    assert respuesta.status_code == 401


def test_rag_follow_up_responde_503_retrieval_unavailable_cuando_faltan_los_bordes_reales_de_la_recuperacion():
    cliente = _cliente(llm_provider="local")

    respuesta = cliente.post("/rag/follow-up", json=solicitud_de_seguimiento())

    assert respuesta.status_code == 503
    assert respuesta.json()["error"] == "RETRIEVAL_UNAVAILABLE"


def test_cargar_terminos_por_tipo_incluye_el_codigo_del_tipo_normalizado_cuando_el_catalogo_no_trae_sinonimos():
    terminos = cargar_terminos_por_tipo(CATALOGOS, ["mama", "prostata"])

    assert "mama" in terminos["mama"] and "prostata" in terminos["prostata"]
    assert "prostata" not in terminos["mama"]
