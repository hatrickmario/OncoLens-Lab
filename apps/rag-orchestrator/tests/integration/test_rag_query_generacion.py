"""`POST /rag/query`, generación y recorte de la rama con evidencia (US-225 / L1D-275): FR-09, RN-01, RN-03, RN-28.

El ``LlmEvidenceGenerator`` REAL recibe un LLM falso que devuelve JSON crudo (FX-06a-b): el parseo, la validación del
esquema interno y el recorte corren como en producción. Cada respuesta del proveedor
se valida contra el spec con el hook de `verificacion_proveedor.py` (US-214).
"""

import pytest

from tests.support.generador_llm import generador_con_llm
from tests.support.aplicabilidad import catalogo_de_test_sin_criterios, criterios_de
from tests.support.generador_falso import OPCION_ANTI_HER2, TITULO_INVENTADO
from tests.support.llm_falso import OPCION_SOLA, FakeLlmClient
from tests.support.recuperacion import Q_HER2, Q_TOX, crear_entorno, solicitud_de

RESPUESTA = "#/components/schemas/RagQueryInternalResponse"
RESPUESTA_503 = "#/paths/~1rag~1query/post/responses/503"


def _consultar(escenario: str, pregunta: str = Q_HER2, *, max_options: int = 1, criterios=None):
    llm = FakeLlmClient(escenario)
    entorno = crear_entorno(generador=generador_con_llm(llm), criterios=criterios)
    respuesta = entorno.consultar(solicitud_de(pregunta, max_options=max_options))
    return respuesta, llm


@pytest.mark.ac("US-225", 1)
def test_rag_query_devuelve_con_evidencia_con_una_opcion_que_cita_ch_m1_1_cuando_q_her2_tiene_evidencia_sobre_el_umbral(
    tmp_path,
):
    # L1D-127: el catálogo real ya trae criterios de aplicabilidad; este AC es del contrato S1 y se verifica con un
    # catálogo de test sin criterios (``items: []``). La aplicabilidad poblada la cubre test_rag_query_aplicabilidad.py.
    sin_criterios = criterios_de(catalogo_de_test_sin_criterios(tmp_path))
    respuesta, _ = _consultar("LLM-OK", criterios=sin_criterios)

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert cuerpo["status"] == "con_evidencia"
    assert len(cuerpo["evidenceOptions"]) == 1
    opcion = cuerpo["evidenceOptions"][0]
    assert opcion["option"] == OPCION_ANTI_HER2
    assert opcion["citedSources"][0]["chunkId"] == "ch-m1-1"
    assert opcion["relevanceScore"] == 0.87
    assert cuerpo["topRelevanceScore"] == 0.87
    assert cuerpo["synthesis"] == {"agreements": [], "discrepancies": []}
    assert cuerpo["applicability"] == []
    assert cuerpo["agentSteps"] == []
    assert cuerpo["meta"]["corpusCutoffDate"] == "2026-09-30"
    assert cuerpo["meta"]["responseLanguage"] == cuerpo["meta"]["queryLanguage"]
    assert cuerpo["limitations"] == []
    assert cuerpo["omittedClaims"] == 0


def test_rag_query_toma_el_puntaje_de_la_cita_mas_relevante_cuando_la_opcion_cita_dos_chunks():
    respuesta, _ = _consultar("LLM-CITA-DOBLE")

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert cuerpo["evidenceOptions"][0]["relevanceScore"] == 0.87
    assert cuerpo["topRelevanceScore"] == 0.87


@pytest.mark.ac("US-225", 2)
def test_rag_query_devuelve_con_evidencia_vacio_tras_una_invocacion_del_llm_cuando_q_tox_no_tiene_opciones_terapeuticas():
    respuesta, llm = _consultar("LLM-SIN-OPCIONES", Q_TOX)

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert cuerpo["status"] == "con_evidencia"
    assert cuerpo["evidenceOptions"] == []
    assert cuerpo["topRelevanceScore"] == 0.60
    assert llm.invocaciones == 1


@pytest.mark.ac("US-225", 3)
def test_rag_query_conserva_solo_la_opcion_de_mayor_relevancia_sin_descartar_la_otra_cuando_max_options_es_1_y_llm_dos_devuelve_dos_validas():
    respuesta, _ = _consultar("LLM-DOS", max_options=1)

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert [o["relevanceScore"] for o in cuerpo["evidenceOptions"]] == [0.87]
    assert OPCION_SOLA not in respuesta.text
    assert cuerpo["discardedOptions"] == []


def test_rag_query_ordena_por_relevancia_cuando_max_options_admite_las_dos_opciones():
    respuesta, _ = _consultar("LLM-DOS", max_options=3)

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert [o["relevanceScore"] for o in cuerpo["evidenceOptions"]] == [0.87, 0.40]


@pytest.mark.ac("US-063", 4)
def test_rag_query_no_emite_titulo_ni_fuente_inventados_cuando_el_llm_los_agrega_al_json_crudo():
    respuesta, _ = _consultar("LLM-TITULO-FALSO")

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    cita = cuerpo["evidenceOptions"][0]["citedSources"][0]
    assert cita["title"] == "Breast Cancer Treatment (test)"
    assert cita["sourceName"] == "NCI PDQ"
    assert TITULO_INVENTADO not in respuesta.text


@pytest.mark.parametrize("escenario", ["LLM-FUERA-DE-ESQUEMA", "LLM-JSON-ROTO"])
def test_rag_query_responde_503_llm_output_invalid_sin_opciones_cuando_el_llm_devuelve_un_json_invalido(
    escenario,
):
    respuesta, llm = _consultar(escenario)

    assert llm.invocaciones == 1  # sin reintento silencioso
    assert respuesta.status_code == 503
    cuerpo = respuesta.json()
    assert cuerpo["error"] == "LLM_OUTPUT_INVALID"
    assert "evidenceOptions" not in cuerpo
