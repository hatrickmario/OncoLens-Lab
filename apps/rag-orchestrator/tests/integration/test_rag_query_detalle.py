"""`POST /rag/query`, detalle expandible de cada opción (ARR-08 / L1D-284): RN-01, RN-23, RN-22.

El ``LlmEvidenceGenerator`` REAL recibe un LLM falso que devuelve JSON crudo con ``details``; el NLI falso decide el soporte
de cada afirmación. Cada respuesta la valida contra el spec del proveedor el hook de `verificacion_proveedor.py` (US-214).
"""

import pytest

from tests.support.generador_llm import generador_con_llm
from tests.support.llm_falso import DETALLE_DOS, DETALLE_TRES, DETALLE_UNO, FakeLlmClient
from tests.support.nli_falso import IMPLICA, NEUTRAL, NliFalso
from tests.support.recuperacion import Q_HER2, crear_entorno, solicitud_de

RESPUESTA = "#/components/schemas/RagQueryInternalResponse"


def _consultar(escenario: str, nli: NliFalso, **generador):
    entorno = crear_entorno(
        generador=generador_con_llm(FakeLlmClient(escenario), **generador), clasificador_nli=nli
    )
    respuesta = entorno.consultar(solicitud_de(Q_HER2))
    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    return cuerpo


MARCO = "La fuente reporta que "


@pytest.mark.ac("ARR-08", 2)
def test_rag_query_devuelve_los_detalles_en_orden_con_el_marco_cuando_el_nli_soporta_las_secundarias():
    cuerpo = _consultar("LLM-CON-DETALLE", NliFalso(por_defecto=IMPLICA))

    opcion = cuerpo["evidenceOptions"][0]
    assert opcion["details"] == [MARCO + DETALLE_UNO, MARCO + DETALLE_DOS]
    assert cuerpo["omittedClaims"] == 0


def test_rag_query_agrupa_en_el_ultimo_detalle_lo_que_excede_el_maximo_del_contrato():
    cuerpo = _consultar("LLM-CON-TRES-DETALLES", NliFalso(por_defecto=IMPLICA))

    assert cuerpo["evidenceOptions"][0]["details"] == [
        MARCO + DETALLE_UNO,
        f"{MARCO}{DETALLE_DOS} {MARCO}{DETALLE_TRES}",
    ]


def test_rag_query_responde_503_llm_output_invalid_cuando_la_salida_excede_el_maximo_de_afirmaciones():
    entorno = crear_entorno(
        generador=generador_con_llm(FakeLlmClient("LLM-CON-TRES-DETALLES"), claims_max=3),
        clasificador_nli=NliFalso(por_defecto=IMPLICA),
    )

    respuesta = entorno.consultar(solicitud_de(Q_HER2))

    assert respuesta.status_code == 503
    assert respuesta.json()["error"] == "LLM_OUTPUT_INVALID"


@pytest.mark.ac("ARR-08", 2)
def test_rag_query_omite_la_secundaria_sin_soporte_y_cuenta_omitted_claims_sin_descartar_la_opcion():
    nli = NliFalso(por_defecto=IMPLICA, resultados={DETALLE_DOS: NEUTRAL})

    cuerpo = _consultar("LLM-CON-DETALLE", nli)

    assert cuerpo["evidenceOptions"][0]["details"] == [MARCO + DETALLE_UNO]
    assert cuerpo["discardedOptions"] == []
    assert cuerpo["omittedClaims"] == 1


def test_rag_query_no_incluye_details_en_la_opcion_cuando_el_llm_no_trae_mas_que_la_principal():
    cuerpo = _consultar("LLM-OK", NliFalso(por_defecto=IMPLICA))

    assert "details" not in cuerpo["evidenceOptions"][0]


def test_rag_query_no_incluye_details_cuando_ninguna_secundaria_se_soporta():
    cuerpo = _consultar(
        "LLM-CON-DETALLE",
        NliFalso(por_defecto=IMPLICA, resultados={DETALLE_UNO: NEUTRAL, DETALLE_DOS: NEUTRAL}),
    )

    assert "details" not in cuerpo["evidenceOptions"][0]
    assert cuerpo["omittedClaims"] == 2


def _prompts_enviados(**generador) -> list[str]:
    llm = FakeLlmClient("LLM-OK")
    entorno = crear_entorno(
        generador=generador_con_llm(llm, **generador),
        clasificador_nli=NliFalso(por_defecto=IMPLICA),
    )
    assert entorno.consultar(solicitud_de(Q_HER2)).status_code == 200
    return llm.prompts


def test_el_prompt_entrega_todos_los_fragmentos_sobre_el_umbral_cuando_caben_en_el_presupuesto():
    (prompt,) = _prompts_enviados()

    assert prompt.count("[fragmento C") >= 2


def test_el_prompt_recorta_los_fragmentos_al_presupuesto_dejando_siempre_el_mas_relevante():
    (prompt,) = _prompts_enviados(max_chars_fragmentos=1)

    assert prompt.count("[fragmento C") == 1


def test_rag_query_omite_la_secundaria_con_artefactos_de_generacion_aunque_el_nli_lo_implique():
    cuerpo = _consultar("LLM-DETALLE-CON-ARTEFACTO", NliFalso(por_defecto=IMPLICA))

    assert cuerpo["evidenceOptions"][0]["details"] == [MARCO + DETALLE_UNO]
