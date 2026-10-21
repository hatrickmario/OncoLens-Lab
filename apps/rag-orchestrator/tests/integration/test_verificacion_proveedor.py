"""Verificación automática del proveedor (US-214): cada respuesta del TestClient se valida contra el spec."""

import json

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


def _ejemplo(nombre: str) -> dict:
    return json.loads((EJEMPLOS / nombre).read_text(encoding="utf-8"))


def _cliente_con(respuesta: dict) -> TestClient:
    consulta = ConsultaEvidenciaContadora(RagQueryInternalResponse.model_validate(respuesta))
    settings = settings_de_prueba(llm_provider="fake", fake_responses_path=EJEMPLOS)
    app = crear_app(settings, trace_ids=GeneradorTraceFijo(), clock=RelojFijo(), consulta=consulta)
    return TestClient(app, raise_server_exceptions=False, headers=con_token_valido(par_de_sesion()))


@pytest.mark.ac("US-214", 2)
def test_rag_query_falla_nombrando_la_ruta_json_cuando_sin_evidencia_trae_top_relevance_score_cero():
    sin_evidencia_con_cero = {**_ejemplo("rag-query-sin-evidencia.json"), "topRelevanceScore": 0.0}

    with pytest.raises(AssertionError) as fallo:
        _cliente_con(sin_evidencia_con_cero).post(
            "/rag/query", json=_ejemplo("rag-query-request.json")
        )

    mensaje = str(fallo.value)
    for pieza in ("rag-orchestrator", "POST", "/rag/query", "200", "/topRelevanceScore"):
        assert pieza in mensaje
    assert "0.0" not in mensaje
