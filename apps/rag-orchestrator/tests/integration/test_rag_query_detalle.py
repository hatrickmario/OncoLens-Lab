"""`POST /rag/query`, detalle expandible de cada opción (ARR-08 / L1D-284): RN-01, RN-23, RN-22.

El ``LlmEvidenceGenerator`` REAL recibe un LLM falso que devuelve JSON crudo con ``details``; el NLI falso decide el soporte
de cada afirmación. Cada respuesta se valida contra el spec del proveedor (`assert_matches_spec`).
"""

import pytest

from app.application.generation import LlmEvidenceGenerator
from tests.support.contract import assert_matches_spec
from tests.support.llm_falso import DETALLE_DOS, DETALLE_UNO, FakeLlmClient
from tests.support.nli_falso import IMPLICA, NEUTRAL, NliFalso
from tests.support.recuperacion import Q_HER2, crear_entorno, solicitud_de

RESPUESTA = "#/components/schemas/RagQueryInternalResponse"


def _consultar(escenario: str, nli: NliFalso, **generador):
    entorno = crear_entorno(
        generador=LlmEvidenceGenerator(FakeLlmClient(escenario), **generador), clasificador_nli=nli
    )
    respuesta = entorno.consultar(solicitud_de(Q_HER2))
    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert_matches_spec(RESPUESTA, cuerpo)
    return cuerpo


@pytest.mark.ac("ARR-08", 2)
def test_rag_query_devuelve_los_parrafos_de_detalle_en_orden_y_solo_hasta_el_maximo_configurado_cuando_el_nli_los_soporta():
    cuerpo = _consultar("LLM-CON-DETALLE", NliFalso(por_defecto=IMPLICA))

    opcion = cuerpo["evidenceOptions"][0]
    assert opcion["details"] == [DETALLE_UNO, DETALLE_DOS]
    assert cuerpo["omittedClaims"] == 0


def test_rag_query_respeta_un_maximo_de_un_parrafo_de_detalle_cuando_se_configura_asi():
    cuerpo = _consultar("LLM-CON-DETALLE", NliFalso(por_defecto=IMPLICA), max_parrafos_detalle=1)

    assert cuerpo["evidenceOptions"][0]["details"] == [DETALLE_UNO]


@pytest.mark.ac("ARR-08", 2)
def test_rag_query_omite_el_parrafo_sin_soporte_y_cuenta_omitted_claims_sin_descartar_la_opcion():
    nli = NliFalso(por_defecto=IMPLICA, resultados={DETALLE_DOS: NEUTRAL})

    cuerpo = _consultar("LLM-CON-DETALLE", nli)

    assert cuerpo["evidenceOptions"][0]["details"] == [DETALLE_UNO]
    assert cuerpo["discardedOptions"] == []
    assert cuerpo["omittedClaims"] == 1


def test_rag_query_no_incluye_details_en_la_opcion_cuando_el_llm_no_los_trae():
    cuerpo = _consultar("LLM-OK", NliFalso(por_defecto=IMPLICA))

    assert "details" not in cuerpo["evidenceOptions"][0]


def test_rag_query_no_incluye_details_cuando_ningun_parrafo_se_soporta():
    cuerpo = _consultar(
        "LLM-CON-DETALLE",
        NliFalso(por_defecto=IMPLICA, resultados={DETALLE_UNO: NEUTRAL, DETALLE_DOS: NEUTRAL}),
    )

    assert "details" not in cuerpo["evidenceOptions"][0]
    assert cuerpo["omittedClaims"] == 2


def _prompts_enviados(**generador) -> list[str]:
    llm = FakeLlmClient("LLM-OK")
    entorno = crear_entorno(
        generador=LlmEvidenceGenerator(llm, **generador),
        clasificador_nli=NliFalso(por_defecto=IMPLICA),
    )
    assert entorno.consultar(solicitud_de(Q_HER2)).status_code == 200
    return llm.prompts


def test_el_prompt_entrega_todos_los_fragmentos_sobre_el_umbral_cuando_caben_en_el_presupuesto():
    (prompt,) = _prompts_enviados()

    assert prompt.count("[chunkId:") >= 2


def test_el_prompt_recorta_los_fragmentos_al_presupuesto_dejando_siempre_el_mas_relevante():
    (prompt,) = _prompts_enviados(max_chars_fragmentos=1)

    assert prompt.count("[chunkId:") == 1
