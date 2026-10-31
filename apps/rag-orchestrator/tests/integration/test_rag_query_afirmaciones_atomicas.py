"""`POST /rag/query`, afirmaciones atómicas por papel (US-245 / L1D-295): RN-01, RN-23, ADR-34, FR-10.

El ``LlmEvidenceGenerator`` REAL recibe el LLM falso de FX-T1a-b (JSON crudo con ``claims[]``) y el NLI falso resuelve
por hipótesis. Cada respuesta se valida contra el spec del proveedor (hook de ``verificacion_proveedor.py``, US-214).
"""

from __future__ import annotations

import logging

import pytest

from tests.support.afirmaciones_atomicas import (
    PRINCIPAL,
    PRINCIPAL_MODAL,
    SALVEDAD,
    SECUNDARIA,
    SECUNDARIA_CON_ALIAS,
    SECUNDARIA_MODAL,
    SECUNDARIA_PRESCRIPTIVA,
    SENTINELA,
)
from tests.support.generador_llm import generador_con_llm
from tests.support.llm_falso import FakeLlmClient
from tests.support.nli_falso import IMPLICA, NEUTRAL, NliFalso
from tests.support.recuperacion import CORPUS_FX06A, Q_HER2, crear_entorno, solicitud_de

RESPUESTA = "#/components/schemas/RagQueryInternalResponse"
RESPUESTA_503 = "#/paths/~1rag~1query/post/responses/503"
MARCO = "La fuente reporta que "
NO_MOSTRADO = "(texto no mostrado)"
TEXTO_DE_CH_M1_1 = next(c.texto for c in CORPUS_FX06A if c.chunk_id == "ch-m1-1")


def _consultar(escenario: str, nli: NliFalso | None = None, llm: FakeLlmClient | None = None):
    nli = nli or NliFalso(por_defecto=IMPLICA)
    llm = llm or FakeLlmClient(escenario)
    entorno = crear_entorno(generador=generador_con_llm(llm), clasificador_nli=nli)
    return entorno.consultar(solicitud_de(Q_HER2, max_options=3)), nli, llm


@pytest.mark.ac("US-245", 1)
def test_rag_query_afirmaciones_atomicas_con_soporte_conserva_opcion_con_marco():
    respuesta, nli, _ = _consultar("LLM-ATOM-OK")

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    (opcion,) = cuerpo["evidenceOptions"]
    assert opcion["rationale"] == MARCO + PRINCIPAL
    assert opcion["details"] == [MARCO + SECUNDARIA, MARCO + SALVEDAD]
    assert [(p.premisa, p.hipotesis) for p in nli.pares_recibidos] == [
        (TEXTO_DE_CH_M1_1, PRINCIPAL),
        (TEXTO_DE_CH_M1_1, SECUNDARIA),
        (TEXTO_DE_CH_M1_1, SALVEDAD),
    ]
    assert '"claims"' not in respuesta.text and '"role"' not in respuesta.text
    assert cuerpo["omittedClaims"] == 0 and cuerpo["discardedOptions"] == []


@pytest.mark.ac("US-245", 2)
def test_rag_query_omite_la_secundaria_sin_soporte_y_conserva_la_opcion():
    nli = NliFalso(resultados={SECUNDARIA: NEUTRAL}, por_defecto=IMPLICA)

    respuesta, _, _ = _consultar("LLM-ATOM-SEC", nli)

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    (opcion,) = cuerpo["evidenceOptions"]
    assert opcion["details"] == [MARCO + SALVEDAD]
    assert cuerpo["omittedClaims"] == 1
    assert SECUNDARIA not in respuesta.text


@pytest.mark.ac("US-245", 3)
def test_rag_query_descarta_la_opcion_con_la_principal_sin_soporte():
    nli = NliFalso(resultados={PRINCIPAL: NEUTRAL}, por_defecto=IMPLICA)

    respuesta, _, _ = _consultar("LLM-ATOM-PRIN", nli)

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert cuerpo["evidenceOptions"] == []
    (descartada,) = cuerpo["discardedOptions"]
    assert descartada["discardReason"] == "afirmacion_sin_soporte"
    assert descartada["unsupportedClaims"] == [PRINCIPAL]


@pytest.mark.ac("US-245", 4)
def test_rag_query_descarta_la_opcion_con_la_salvedad_sin_soporte():
    nli = NliFalso(resultados={SALVEDAD: NEUTRAL}, por_defecto=IMPLICA)

    respuesta, _, _ = _consultar("LLM-ATOM-SALV", nli)

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert cuerpo["evidenceOptions"] == []
    (descartada,) = cuerpo["discardedOptions"]
    assert descartada["discardReason"] == "afirmacion_sin_soporte"
    assert descartada["unsupportedClaims"] == [SALVEDAD]


@pytest.mark.ac("US-245", 5)
def test_rag_query_omite_la_secundaria_con_alias_de_fragmento_y_conserva_la_opcion():
    respuesta, nli, _ = _consultar("LLM-ATOM-ALIAS")

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    (opcion,) = cuerpo["evidenceOptions"]
    assert opcion["details"] == [MARCO + SALVEDAD]
    assert cuerpo["omittedClaims"] == 1
    assert "fragmento C" not in respuesta.text
    assert SECUNDARIA_CON_ALIAS not in [p.hipotesis for p in nli.pares_recibidos]


@pytest.mark.ac("US-245", 5)
def test_rag_query_omite_la_secundaria_y_conserva_la_opcion_cuando_una_secundaria_trae_modal_normativo():
    respuesta, nli, _ = _consultar("LLM-ATOM-MODAL")

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert len(cuerpo["evidenceOptions"]) == 1
    assert cuerpo["discardedOptions"] == []
    assert cuerpo["omittedClaims"] == 1
    assert SECUNDARIA_MODAL not in respuesta.text
    assert SECUNDARIA_MODAL not in [p.hipotesis for p in nli.pares_recibidos]


@pytest.mark.ac("US-245", 5)
def test_rag_query_descarta_sin_exponer_el_texto_cuando_la_principal_trae_modal_normativo():
    respuesta, nli, _ = _consultar("LLM-ATOM-MODAL-PRIN")

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert cuerpo["evidenceOptions"] == []
    (descartada,) = cuerpo["discardedOptions"]
    assert descartada["discardReason"] == "afirmacion_sin_soporte"
    assert descartada["unsupportedClaims"] == [NO_MOSTRADO]
    assert PRINCIPAL_MODAL not in respuesta.text
    assert PRINCIPAL_MODAL not in [p.hipotesis for p in nli.pares_recibidos]


@pytest.mark.ac("US-245", 6)
def test_rag_query_descarta_con_lenguaje_no_permitido_cuando_una_secundaria_es_prescriptiva():
    respuesta, _, _ = _consultar("LLM-ATOM-PRESC")

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert cuerpo["evidenceOptions"] == []
    (descartada,) = cuerpo["discardedOptions"]
    assert descartada["discardReason"] == "lenguaje_no_permitido"
    assert SECUNDARIA_PRESCRIPTIVA not in respuesta.text
    assert "recomendado para este paciente" not in respuesta.text


@pytest.mark.ac("US-245", 8)
def test_rag_query_responde_503_nli_unavailable_sin_opciones_cuando_el_nli_falla():
    nli = NliFalso(error=RuntimeError("nli caído"))

    respuesta, _, _ = _consultar("LLM-ATOM-OK", nli)

    assert respuesta.status_code == 503
    cuerpo = respuesta.json()
    assert cuerpo["error"] == "NLI_UNAVAILABLE"
    assert "evidenceOptions" not in cuerpo
    assert PRINCIPAL not in respuesta.text


@pytest.mark.ac("US-245", 1)
@pytest.mark.parametrize("escenario", ["LLM-ATOM-DOS-PRINCIPALES", "LLM-ATOM-SIN-PRINCIPAL"])
def test_rag_query_responde_503_llm_output_invalid_sin_eco_cuando_la_salida_no_tiene_una_sola_principal(
    escenario, caplog
):
    caplog.set_level(logging.DEBUG)

    respuesta, nli, llm = _consultar(escenario)

    assert llm.invocaciones == 1  # sin reintento silencioso
    assert respuesta.status_code == 503
    cuerpo = respuesta.json()
    assert cuerpo["error"] == "LLM_OUTPUT_INVALID"
    assert "evidenceOptions" not in cuerpo
    assert SENTINELA not in respuesta.text
    assert nli.invocaciones == 0
    assert SENTINELA not in caplog.text and SECUNDARIA not in caplog.text


@pytest.mark.ac("US-245", 1)
def test_rag_query_sigue_respondiendo_local_llm_unavailable_cuando_el_llm_no_responde():
    from app.application.ports import FalloDelLlm

    llm = FakeLlmClient("LLM-ATOM-OK", error=FalloDelLlm("conexión rechazada"))

    respuesta, _, _ = _consultar("LLM-ATOM-OK", llm=llm)

    assert respuesta.status_code == 503
    assert respuesta.json()["error"] == "LOCAL_LLM_UNAVAILABLE"


@pytest.mark.parametrize(
    ("escenario", "texto_centinela"),
    [
        ("LLM-ATOM-ALIAS", SECUNDARIA_CON_ALIAS),
        ("LLM-ATOM-MODAL", SECUNDARIA_MODAL),
        ("LLM-ATOM-MODAL-PRIN", PRINCIPAL_MODAL),
        ("LLM-ATOM-PRESC", SECUNDARIA_PRESCRIPTIVA),
        ("LLM-ATOM-SEC", SECUNDARIA),
    ],
)
def test_rag_query_no_registra_el_texto_de_una_afirmacion_retirada_u_omitida_en_los_logs(
    escenario, texto_centinela, caplog
):
    caplog.set_level(logging.DEBUG)
    nli = NliFalso(resultados={SECUNDARIA: NEUTRAL}, por_defecto=IMPLICA)

    respuesta, _, _ = _consultar(escenario, nli)

    assert respuesta.status_code == 200
    assert caplog.records, "la sonda no vio ningún log: el test no probaría nada"
    assert texto_centinela not in caplog.text
    assert "fragmento C" not in caplog.text
