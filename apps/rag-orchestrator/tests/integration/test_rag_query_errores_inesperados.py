"""Defensa en profundidad de `/rag/query`: un fallo inesperado responde un 500 fijo y no escribe la pregunta en el log."""

import logging

from fastapi.testclient import TestClient

from app.bootstrap import crear_app
from app.schemas.generated.models import RagQueryInternalRequest
from tests.support.fakes import GeneradorTraceFijo, RelojFijo, par_de_sesion, settings_de_prueba
from tests.support.recuperacion import Q_HER2, solicitud_de
from tests.support.service_jwt import con_token_valido


class _ConsultaQueExplota:
    async def consultar(self, solicitud: RagQueryInternalRequest):
        raise RuntimeError(f"fallo inesperado con la pregunta {solicitud.query!r}")


def test_rag_query_responde_500_fijo_y_registra_solo_clase_y_trace_id_cuando_falla_algo_inesperado(
    caplog,
):
    app = crear_app(
        settings_de_prueba(),
        trace_ids=GeneradorTraceFijo(),
        clock=RelojFijo(),
        consulta=_ConsultaQueExplota(),
    )
    cliente = TestClient(
        app, raise_server_exceptions=False, headers=con_token_valido(par_de_sesion())
    )
    solicitud = solicitud_de(Q_HER2)
    caplog.set_level(logging.DEBUG)

    respuesta = cliente.post("/rag/query", json=solicitud)

    assert respuesta.status_code == 500
    assert respuesta.json() == {
        "error": "ERROR_INTERNO",
        "message": "Error interno.",
        "traceId": solicitud["traceId"],
    }
    propios = [r.getMessage() for r in caplog.records if "event=error_interno" in r.getMessage()]
    assert propios == [f"event=error_interno clase=RuntimeError traceId={solicitud['traceId']}"]
    assert all(Q_HER2 not in r.getMessage() for r in caplog.records)
