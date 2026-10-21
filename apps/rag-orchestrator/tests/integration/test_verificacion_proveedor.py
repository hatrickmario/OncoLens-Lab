"""Verificación automática del proveedor (US-214): cada respuesta del TestClient se valida contra el spec."""

import asyncio
import json

import httpx
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


def test_health_deja_una_linea_en_el_archivo_de_reporte_cuando_la_respuesta_se_verifica(
    tmp_path, monkeypatch
):
    reporte = tmp_path / "reporte.txt"
    monkeypatch.setenv("CONTRACT_VERIFY_REPORT", str(reporte))
    settings = settings_de_prueba(llm_provider="fake", fake_responses_path=EJEMPLOS)
    cliente = TestClient(crear_app(settings, trace_ids=GeneradorTraceFijo(), clock=RelojFijo()))

    cliente.get("/health")

    assert reporte.read_text(encoding="utf-8") == "rag-orchestrator\n"


def _sin_evidencia_con_cero() -> dict:
    return {**_ejemplo("rag-query-sin-evidencia.json"), "topRelevanceScore": 0.0}


def test_rag_query_falla_con_un_asyncclient_asgi_cuando_la_respuesta_incumple_el_spec():
    cliente = _cliente_con(_sin_evidencia_con_cero())

    async def consultar() -> None:
        transporte = httpx.ASGITransport(app=cliente.app)
        async with httpx.AsyncClient(
            transport=transporte, base_url="http://prueba", headers=cliente.headers
        ) as asincrono:
            await asincrono.post("/rag/query", json=_ejemplo("rag-query-request.json"))

    with pytest.raises(AssertionError, match="/topRelevanceScore"):
        asyncio.run(consultar())


@pytest.mark.sin_verificacion_de_proveedor
def test_rag_query_no_verifica_la_respuesta_cuando_el_test_declara_la_salida_explicita():
    respuesta = _cliente_con(_sin_evidencia_con_cero()).post(
        "/rag/query", json=_ejemplo("rag-query-request.json")
    )

    assert respuesta.status_code == 200
