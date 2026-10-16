import json

import pytest
from fastapi.testclient import TestClient

from app.bootstrap import crear_app
from app.schemas.generated.models import RagQueryInternalResponse
from tests.support.contract import RAIZ_REPOSITORIO, assert_matches_spec
from tests.support.fakes import (
    ConsultaEvidenciaContadora,
    GeneradorTraceFijo,
    RelojFijo,
    par_de_sesion,
    settings_de_prueba,
)
from tests.support.service_jwt import con_token_valido

EJEMPLOS = RAIZ_REPOSITORIO / "contracts/examples"
RESPUESTA = "#/components/schemas/RagQueryInternalResponse"


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
