"""Logs JSON con `traceId` en todas las líneas de la request (US-037 AC-4, lado de rag-orchestrator)."""

import logging

import pytest
from fastapi.testclient import TestClient

from app.bootstrap import crear_app
from app.schemas.generated.models import RagQueryInternalRequest
from tests.support.fakes import GeneradorTraceFijo, RelojFijo, par_de_sesion, settings_de_prueba
from tests.support.logs import (
    exigir_sin_valores_prohibidos,
    parsear_lineas_json,
)
from tests.support.recuperacion import Q_HER2, solicitud_de
from tests.support.service_jwt import con_token_valido

TRACE_GENERADO = "req_TestGen0001"
TRACE_ENTRANTE_INVALIDO = "t-123"


class _ConsultaQueExplota:
    async def consultar(self, solicitud: RagQueryInternalRequest):
        raise RuntimeError("fallo inesperado")


def _lineas_del_servicio(salida: str) -> list[dict]:
    """Las líneas JSON del servicio: se excluye el logger `httpx2`, que es el del propio TestClient (el cliente del
    test, fuera de la request); `httpx` (el que usa el servicio hacia el LLM) sí cuenta y está en WARNING."""
    return [linea for linea in parsear_lineas_json(salida) if linea["logger"] != "httpx2"]


def _app():
    return crear_app(
        settings_de_prueba(),
        trace_ids=GeneradorTraceFijo(TRACE_GENERADO),
        clock=RelojFijo(),
        consulta=_ConsultaQueExplota(),
    )


def _cliente(*, con_jwt: bool = True, **cabeceras: str) -> TestClient:
    jwt = con_token_valido(par_de_sesion()) if con_jwt else {}
    return TestClient(_app(), raise_server_exceptions=False, headers={**jwt, **cabeceras})


@pytest.mark.ac("US-037", 4)
def test_logs_request_con_trace_id_todas_las_lineas_json_con_ese_trace_id(logs_json):
    solicitud = {**solicitud_de(Q_HER2), "traceId": TRACE_GENERADO}

    respuesta = _cliente(**{"X-Trace-Id": TRACE_GENERADO}).post("/rag/query", json=solicitud)

    salida = logs_json()
    lineas = _lineas_del_servicio(salida)
    assert respuesta.status_code == 500
    assert lineas, "la request debe dejar al menos una línea de log"
    assert [linea["traceId"] for linea in lineas] == [TRACE_GENERADO] * len(lineas)
    exigir_sin_valores_prohibidos(salida, [Q_HER2])


def test_logs_request_con_trace_id_invalido_usa_el_generado_y_no_registra_el_entrante(logs_json):
    cliente = _cliente(con_jwt=False, **{"X-Trace-Id": TRACE_ENTRANTE_INVALIDO})

    respuesta = cliente.post("/rag/query", json={})

    salida = logs_json()
    lineas = _lineas_del_servicio(salida)
    assert respuesta.status_code == 401
    assert lineas
    assert [linea["traceId"] for linea in lineas] == [TRACE_GENERADO] * len(lineas)
    exigir_sin_valores_prohibidos(salida, [TRACE_ENTRANTE_INVALIDO])


def test_logs_request_sin_cabecera_genera_el_trace_id_en_todas_las_lineas(logs_json):
    cliente = _cliente(con_jwt=False)

    respuesta = cliente.post("/rag/query", json={})

    lineas = _lineas_del_servicio(logs_json())
    assert respuesta.status_code == 401
    assert lineas
    assert [linea["traceId"] for linea in lineas] == [TRACE_GENERADO] * len(lineas)


def test_la_sonda_detecta_un_valor_prohibido_inyectado_en_el_canal_real(logs_json):
    # Mutación: si el espía no capturara el canal real, esta inyección pasaría inadvertida y la suite sería ciega.
    logging.getLogger("app.sonda").warning("valor prohibido SENTINELA-SONDA-77")

    with pytest.raises(AssertionError, match="SENTINELA-SONDA-77"):
        exigir_sin_valores_prohibidos(logs_json(), ["SENTINELA-SONDA-77"])


def test_la_sonda_detecta_una_linea_que_no_es_json():
    with pytest.raises(AssertionError, match="no es JSON"):
        parsear_lineas_json('{"traceId": "x"}\ntexto suelto\n')
