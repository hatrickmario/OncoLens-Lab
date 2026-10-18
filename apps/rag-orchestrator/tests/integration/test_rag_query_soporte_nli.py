"""`POST /rag/query`, soporte NLI y lenguaje de la rama con evidencia (US-064 / L1D-180): RN-01, RN-22, RN-23.

Corpus FX-06a-a, catálogo, generador (FX-06b) y NLI falsos (FX-06a-b); cada respuesta se valida contra el spec del
proveedor (`assert_matches_spec`) [S1 resp. 17]. Los textos de prueba no son prescriptivos salvo los que ejercitan RN-23.
"""

import json
import logging

import pytest

from app.application.generation import LlmEvidenceGenerator
from app.application.ports import ResultadoNli
from app.domain.lenguaje import ListaTerminos
from app.domain.support import RETIRO_ES
from app.prompts.rag_query import VERSION_DEL_PROMPT
from tests.support.contract import CATALOGOS, assert_matches_spec
from tests.support.generador_falso import (
    LIMITACION_PRESCRIPTIVA,
    LIMITACION_SIN_SOPORTE,
    OPCION_ANTI_HER2,
    RAZON_ANTI_HER2,
    RAZON_PRESCRIPTIVA,
    RAZON_SIN_SOPORTE,
    FakeEvidenceGenerator,
)
from tests.support.llm_falso import OPCION_SOLA, FakeLlmClient
from tests.support.nli_falso import CONTRADICE, IMPLICA, NEUTRAL, NliFalso
from tests.support.recuperacion import CORPUS_FX06A, Q_HER2, crear_entorno, solicitud_de

RESPUESTA = "#/components/schemas/RagQueryInternalResponse"
RESPUESTA_503 = "#/paths/~1rag~1query/post/responses/503"
TEXTO_DE_CH_M1_1 = next(c.texto for c in CORPUS_FX06A if c.chunk_id == "ch-m1-1")
LISTA = ListaTerminos.model_validate_json(
    (CATALOGOS / "lenguaje" / "terminos-prohibidos.json").read_text(encoding="utf-8")
)


def _consultar(
    escenario: str = "LLM-OK",
    *,
    nli: NliFalso | None = None,
    limitaciones: tuple[str, ...] = (),
    max_options: int | None = None,
):
    nli = nli or NliFalso(por_defecto=IMPLICA)
    entorno = crear_entorno(
        generador=FakeEvidenceGenerator(escenario, limitaciones), clasificador_nli=nli
    )
    respuesta = entorno.consultar(solicitud_de(Q_HER2, max_options=max_options))
    return respuesta, nli


def _respuesta_valida(respuesta) -> dict:
    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert_matches_spec(RESPUESTA, cuerpo)
    return cuerpo


def _campos_generados(cuerpo: dict) -> list[str]:
    """Los textos GENERADOS de la respuesta (``CAMPOS_GENERADOS``); lo copiado del corpus queda fuera."""
    textos = [cuerpo["synthesis"][k] for k in ("agreements", "discrepancies")]
    generados: list[str] = [t for lista in textos for t in map(json.dumps, lista)]
    for opcion in (*cuerpo["evidenceOptions"], *cuerpo["discardedOptions"]):
        generados += [opcion["option"], opcion["rationale"]]
    for descartada in cuerpo["discardedOptions"]:
        generados += descartada["unsupportedClaims"]
    generados += [limitacion["text"] for limitacion in cuerpo["limitations"]]
    return generados


def _coincidencias_de_lenguaje(cuerpo: dict) -> list[str]:
    from app.domain.lenguaje import check_prohibited_terms

    return [
        c.id
        for texto in _campos_generados(cuerpo)
        for c in check_prohibited_terms(texto, LISTA, niveles=("A",), permitir_frases=False)
    ]


@pytest.mark.ac("US-064", 1)
def test_rag_query_conserva_la_opcion_e_invoca_el_nli_con_ch_m1_1_como_premisa_y_cada_afirmacion_como_hipotesis_cuando_llm_ok_y_nli_en_entailment():
    respuesta, nli = _consultar("LLM-OK")

    cuerpo = _respuesta_valida(respuesta)
    assert len(cuerpo["evidenceOptions"]) == 1 and cuerpo["discardedOptions"] == []
    assert [(p.premisa, p.hipotesis) for p in nli.pares_recibidos] == [
        (TEXTO_DE_CH_M1_1, RAZON_ANTI_HER2)
    ]


@pytest.mark.ac("US-064", 2)
def test_rag_query_descarta_con_afirmacion_sin_soporte_y_unsupported_claims_cuando_llm_sin_soporte_y_nli_neutral():
    nli = NliFalso(resultados={RAZON_SIN_SOPORTE: NEUTRAL}, por_defecto=IMPLICA)

    respuesta, _ = _consultar("LLM-SIN-SOPORTE", nli=nli)

    cuerpo = _respuesta_valida(respuesta)
    assert cuerpo["evidenceOptions"] == []
    (descartada,) = cuerpo["discardedOptions"]
    assert descartada["discardReason"] == "afirmacion_sin_soporte"
    assert descartada["unsupportedClaims"] == ["reduce la mortalidad a la mitad"]


@pytest.mark.ac("US-064", 3)
def test_rag_query_omite_la_limitacion_propuesta_por_el_generador_y_cuenta_omitted_claims_1_cuando_el_nli_la_clasifica_neutral():
    nli = NliFalso(resultados={LIMITACION_SIN_SOPORTE: NEUTRAL}, por_defecto=IMPLICA)

    respuesta, _ = _consultar("LLM-OK", nli=nli, limitaciones=(LIMITACION_SIN_SOPORTE,))

    cuerpo = _respuesta_valida(respuesta)
    assert cuerpo["limitations"] == []
    assert cuerpo["omittedClaims"] == 1
    assert LIMITACION_SIN_SOPORTE not in respuesta.text


@pytest.mark.ac("US-064", 4)
def test_rag_query_descarta_con_afirmacion_sin_soporte_cuando_el_nli_devuelve_contradiction():
    nli = NliFalso(resultados={RAZON_ANTI_HER2: CONTRADICE}, por_defecto=IMPLICA)

    respuesta, _ = _consultar("LLM-OK", nli=nli)

    cuerpo = _respuesta_valida(respuesta)
    assert cuerpo["evidenceOptions"] == []
    assert [d["discardReason"] for d in cuerpo["discardedOptions"]] == ["afirmacion_sin_soporte"]


@pytest.mark.ac("US-064", 5)
def test_rag_query_descarta_la_opcion_cuando_entailment_0_55_queda_bajo_nli_entailment_threshold_0_7():
    nli = NliFalso(
        resultados={RAZON_ANTI_HER2: ResultadoNli("entailment", 0.55)}, por_defecto=IMPLICA
    )

    respuesta, _ = _consultar("LLM-OK", nli=nli)

    cuerpo = _respuesta_valida(respuesta)
    assert cuerpo["evidenceOptions"] == []
    assert [d["discardReason"] for d in cuerpo["discardedOptions"]] == ["afirmacion_sin_soporte"]


@pytest.mark.ac("US-064", 6)
def test_rag_query_responde_503_nli_unavailable_sin_opciones_cuando_el_adapter_nli_lanza_un_error():
    respuesta, _ = _consultar("LLM-OK", nli=NliFalso(error=RuntimeError("nli caído")))

    assert respuesta.status_code == 503
    cuerpo = respuesta.json()
    assert_matches_spec(RESPUESTA_503, cuerpo)
    assert cuerpo["error"] == "NLI_UNAVAILABLE"
    assert "evidenceOptions" not in cuerpo and RAZON_ANTI_HER2 not in respuesta.text


@pytest.mark.ac("US-064", 7)
def test_rag_query_descarta_la_opcion_y_reemplaza_la_afirmacion_por_el_literal_de_retiro_cuando_la_justificacion_dice_recomendado_para_este_paciente():
    respuesta, nli = _consultar("LLM-PRESCRIPTIVO")

    cuerpo = _respuesta_valida(respuesta)
    assert cuerpo["evidenceOptions"] == []
    (descartada,) = cuerpo["discardedOptions"]
    assert descartada["discardReason"] == "afirmacion_sin_soporte"
    assert descartada["unsupportedClaims"] == [RETIRO_ES]
    assert descartada["rationale"] == RETIRO_ES
    assert _coincidencias_de_lenguaje(cuerpo) == []
    assert RAZON_PRESCRIPTIVA not in respuesta.text
    assert nli.pares_recibidos == []  # un término prohibido no se envía al NLI


@pytest.mark.ac("US-064", 8)
def test_rag_query_omite_la_limitacion_con_debe_recibir_y_cuenta_omitted_claims_1_cuando_el_nli_la_implica():
    respuesta, _ = _consultar("LLM-OK", limitaciones=(LIMITACION_PRESCRIPTIVA,))

    cuerpo = _respuesta_valida(respuesta)
    assert cuerpo["limitations"] == [] and cuerpo["omittedClaims"] == 1
    assert _coincidencias_de_lenguaje(cuerpo) == []
    assert LIMITACION_PRESCRIPTIVA not in respuesta.text


def test_rag_query_conserva_la_limitacion_con_origen_llm_verificado_cuando_el_nli_la_implica():
    texto = "La evidencia recuperada se limita a cáncer de mama HER2 positivo temprano."

    respuesta, _ = _consultar("LLM-OK", limitaciones=(texto,))

    cuerpo = _respuesta_valida(respuesta)
    assert cuerpo["limitations"] == [{"text": texto, "origin": "llm_verificado"}]
    assert cuerpo["omittedClaims"] == 0


def test_rag_query_verifica_el_soporte_antes_de_recortar_a_max_options_cuando_la_mas_relevante_no_tiene_soporte():
    nli = NliFalso(resultados={RAZON_ANTI_HER2: NEUTRAL}, por_defecto=IMPLICA)
    entorno = crear_entorno(
        generador=LlmEvidenceGenerator(FakeLlmClient("LLM-DOS")), clasificador_nli=nli
    )

    respuesta = entorno.consultar(solicitud_de(Q_HER2, max_options=1))

    cuerpo = _respuesta_valida(respuesta)
    assert [o["option"] for o in cuerpo["evidenceOptions"]] == [OPCION_SOLA]
    assert [d["option"] for d in cuerpo["discardedOptions"]] == [OPCION_ANTI_HER2]


def test_rag_query_retira_el_lenguaje_prohibido_de_una_opcion_descartada_por_su_cita_cuando_la_justificacion_es_prescriptiva():
    respuesta, _ = _consultar("LLM-CITA-AJENA-PRESCRIPTIVO")

    cuerpo = _respuesta_valida(respuesta)
    (descartada,) = cuerpo["discardedOptions"]
    assert descartada["discardReason"] == "cita_invalida"
    assert descartada["rationale"] == RETIRO_ES
    assert _coincidencias_de_lenguaje(cuerpo) == []


def test_rag_query_declara_el_nli_model_del_clasificador_y_el_prompt_version_del_prompt_cuando_responde_con_evidencia():
    nli = NliFalso(por_defecto=IMPLICA)
    nli.version = "nli-del-clasificador@9"

    respuesta, _ = _consultar("LLM-OK", nli=nli)

    meta = _respuesta_valida(respuesta)["meta"]
    assert meta["nliModel"] == "nli-del-clasificador@9"
    assert meta["promptVersion"] == VERSION_DEL_PROMPT


@pytest.mark.ac("S1", 29)
def test_rag_query_registra_rule_id_y_language_policy_version_sin_el_texto_retirado_cuando_una_justificacion_contiene_un_termino_prohibido(
    caplog,
):
    caplog.set_level(logging.INFO)

    respuesta, _ = _consultar("LLM-PRESCRIPTIVO")

    assert respuesta.status_code == 200
    eventos = [
        r.getMessage()
        for r in caplog.records
        if "event=fragmento_retirado_lenguaje" in r.getMessage()
    ]
    assert len(eventos) == 1
    assert f"traceId={solicitud_de(Q_HER2)['traceId']}" in eventos[0]
    assert "campo=rationale" in eventos[0]
    assert "ruleId=es-recomendado-para-este-paciente" in eventos[0]
    assert f"languagePolicyVersion={LISTA.version}" in eventos[0]
    todo = "\n".join(r.getMessage() for r in caplog.records)
    assert RAZON_PRESCRIPTIVA not in todo and Q_HER2 not in todo


def test_los_logs_de_la_etapa_de_soporte_solo_llevan_conteos_y_nunca_el_texto_de_afirmaciones_ni_chunks(
    caplog,
):
    caplog.set_level(logging.INFO)

    _consultar("LLM-OK")

    todo = "\n".join(r.getMessage() for r in caplog.records)
    assert "event=rag_query_soporte" in todo
    for secreto in (RAZON_ANTI_HER2, TEXTO_DE_CH_M1_1, Q_HER2):
        assert secreto not in todo
