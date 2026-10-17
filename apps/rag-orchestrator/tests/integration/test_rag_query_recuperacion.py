"""`POST /rag/query`, tramo de recuperación (US-055 / L1D-106): corpus FX-06a-a y bordes falsos, JWT de servicio de test.

Cada respuesta se valida contra el spec del proveedor con `assert_matches_spec` [S1 resp. 17].
"""

from dataclasses import replace

import pytest

from tests.support.contract import assert_matches_spec
from tests.support.recuperacion import (
    PARAMETROS_DE_PRUEBA,
    Q_HER2,
    Q_SIN,
    crear_entorno,
    solicitud_de,
)

RESPUESTA = "#/components/schemas/RagQueryInternalResponse"


@pytest.mark.ac("US-055", 2)
def test_rag_query_responde_sin_evidencia_sin_invocar_al_llm_cuando_la_pregunta_no_tiene_evidencia_sobre_el_umbral():
    entorno = crear_entorno()

    respuesta = entorno.consultar(solicitud_de(Q_SIN))

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert_matches_spec(RESPUESTA, cuerpo)
    assert cuerpo["status"] == "sin_evidencia"
    assert cuerpo["evidenceOptions"] == []
    assert cuerpo["retrievalStats"]["aboveThreshold"] == 0
    assert cuerpo["topRelevanceScore"] is None
    assert entorno.generador.invocaciones == 0


@pytest.mark.ac("US-055", 5)
def test_rag_query_responde_sin_evidencia_sin_invocar_al_llm_cuando_el_umbral_de_configuracion_deja_fuera_todos_los_chunks():
    umbral_alto = replace(PARAMETROS_DE_PRUEBA, relevance_threshold=0.90)
    entorno = crear_entorno(parametros=umbral_alto)

    respuesta = entorno.consultar(solicitud_de(Q_HER2))

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert_matches_spec(RESPUESTA, cuerpo)
    assert cuerpo["status"] == "sin_evidencia"
    assert cuerpo["meta"]["retrievalParams"]["relevanceThreshold"] == 0.90
    assert entorno.generador.invocaciones == 0
