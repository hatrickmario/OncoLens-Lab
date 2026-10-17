import json
import logging

import pytest
from fastapi.testclient import TestClient

from app.bootstrap import crear_app
from app.schemas.generated.models import RagQueryInternalResponse
from tests.support.contract import RAIZ_REPOSITORIO
from tests.support.fakes import (
    ConsultaEvidenciaContadora,
    GeneradorTraceFijo,
    RelojFijo,
    par_de_sesion,
    settings_de_prueba,
)
from tests.support.service_jwt import con_token_valido

EJEMPLOS = RAIZ_REPOSITORIO / "contracts/examples"
VALOR_DE_COOKIE = "SINT-token-de-prueba"
NOMBRE_DE_COOKIE = "oncolens_session"
ATRIBUTOS_ESTANDAR = set(logging.LogRecord("", 0, "", 0, "", None, None).__dict__) | {
    "message",
    "asctime",
}


def _ejemplo(nombre: str) -> dict:
    return json.loads((EJEMPLOS / nombre).read_text(encoding="utf-8"))


def _textos_del_registro(registro: logging.LogRecord) -> list[str]:
    """Todo lo que un registro puede cargar: mensaje, argumentos, `extra` y excepción."""
    extras = [repr(v) for k, v in registro.__dict__.items() if k not in ATRIBUTOS_ESTANDAR]
    argumentos = registro.args if isinstance(registro.args, tuple) else (registro.args,)
    return [
        str(registro.msg),
        registro.getMessage(),
        *(repr(a) for a in argumentos),
        *extras,
        repr(registro.exc_info),
        registro.exc_text or "",
    ]


@pytest.mark.ac("US-211", 5)
def test_rag_query_no_registra_la_cookie_oncolens_session_ni_su_nombre_cuando_llega_un_jwt_valido_y_una_cabecera_cookie_sintetica(
    caplog,
):
    caplog.set_level(logging.DEBUG)
    consulta = ConsultaEvidenciaContadora(
        RagQueryInternalResponse.model_validate(_ejemplo("rag-query-con-evidencia.json"))
    )
    settings = settings_de_prueba(llm_provider="fake", fake_responses_path=EJEMPLOS)
    app = crear_app(settings, trace_ids=GeneradorTraceFijo(), clock=RelojFijo(), consulta=consulta)

    respuesta = TestClient(app, raise_server_exceptions=False).post(
        "/rag/query",
        json=_ejemplo("rag-query-request.json"),
        headers={
            **con_token_valido(par_de_sesion()),
            "Cookie": f"{NOMBRE_DE_COOKIE}={VALOR_DE_COOKIE}",
        },
    )

    assert respuesta.status_code == 200
    assert consulta.invocaciones == 1
    assert caplog.records, "el test debe capturar registros para que la aserción tenga sentido"
    for registro in caplog.records:
        for texto in _textos_del_registro(registro):
            assert VALOR_DE_COOKIE not in texto
            assert NOMBRE_DE_COOKIE not in texto
