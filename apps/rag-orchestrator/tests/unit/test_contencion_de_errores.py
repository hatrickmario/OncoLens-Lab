"""Rama «cabecera ya enviada» de `ContencionDeErroresInesperados`: no relanza y registra solo clase y traceId."""

import asyncio
import logging

from app.api.contencion_de_errores import ContencionDeErroresInesperados
from tests.support.fakes import GeneradorTraceFijo

SENTINELA = "SENTINELA-PREGUNTA-DEL-PACIENTE-5Z"


async def _app_que_falla_despues_de_enviar_la_cabecera(scope, receive, send):
    await send({"type": "http.response.start", "status": 200, "headers": []})
    raise RuntimeError(f"fallo a mitad de la respuesta con {SENTINELA}")


def _ejecutar(app) -> list[dict]:
    enviados: list[dict] = []

    async def receive():
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(mensaje):
        enviados.append(mensaje)

    scope = {"type": "http", "method": "POST", "path": "/rag/query", "headers": [], "state": {}}
    asyncio.run(app(scope, receive, send))
    return enviados


def test_contencion_no_relanza_ni_envia_otra_respuesta_cuando_la_cabecera_ya_salio(caplog):
    app = ContencionDeErroresInesperados(
        _app_que_falla_despues_de_enviar_la_cabecera, GeneradorTraceFijo("req_00000042")
    )
    caplog.set_level(logging.DEBUG)

    enviados = _ejecutar(app)  # si relanzara, esta línea lanzaría RuntimeError

    assert [m["type"] for m in enviados] == ["http.response.start"]
    propios = [r for r in caplog.records if r.name == "app.api.contencion_de_errores"]
    assert [r.getMessage() for r in propios] == [
        "event=error_interno clase=RuntimeError traceId=req_00000042"
    ]
    assert all(r.exc_info is None for r in propios)
    assert all(SENTINELA not in r.getMessage() for r in caplog.records)


def test_contencion_deja_pasar_los_mensajes_que_no_son_http_sin_tocarlos():
    recibidos: list[str] = []

    async def app_de_lifespan(scope, receive, send):
        recibidos.append(scope["type"])

    asyncio.run(
        ContencionDeErroresInesperados(app_de_lifespan, GeneradorTraceFijo())(
            {"type": "lifespan"}, None, None
        )
    )

    assert recibidos == ["lifespan"]
