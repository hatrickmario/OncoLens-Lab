"""`POST /rag/query`, alias efímeros de chunks en la cita (US-236 / L1D-287): RN-04, RN-01, RN-06, RN-24.

El ``LlmEvidenceGenerator`` REAL recibe un ``FakeLlmClient`` que cita por alias; así el prompt, la traducción alias →
``chunkId`` y la validación de citas se ejercen en la ruta de producción. Cada respuesta la valida contra el spec del
proveedor el hook de `verificacion_proveedor.py` (US-214).
"""

import logging
import re

import pytest

from app.domain.alias_de_chunks import PATRON_DE_ALIAS
from tests.support.llm_falso import FakeLlmClient
from tests.support.recuperacion import Q_HER2, solicitud_de
from tests.support.recuperacion_alias import (
    CHUNKS_FX06A_C,
    ORDEN_ESPERADO,
    TEXTO_DE_CH_M1_1,
    entorno_con_alias,
)

ALIAS_EN_TEXTO = re.compile(r"\bC[1-9][0-9]*\b")


def _consultar(escenario: str, **entorno):
    llm = FakeLlmClient(escenario)
    respuesta = entorno_con_alias(llm, **entorno).consultar(solicitud_de(Q_HER2))
    assert respuesta.status_code == 200
    return respuesta.json(), llm, respuesta.text


def _texto_de(chunk_id: str) -> str:
    return next(c.texto for c in CHUNKS_FX06A_C if c.chunk_id == chunk_id)


@pytest.mark.ac("US-236", 1)
def test_rag_query_asigna_c1_a_c4_por_relevancia_y_el_prompt_no_contiene_ningun_chunk_id_real():
    _, llm, _ = _consultar("LLM-OK")

    (prompt,) = llm.prompts
    for alias, chunk_id in zip(("C1", "C2", "C3", "C4"), ORDEN_ESPERADO):
        assert f"[fragmento {alias}]\n{_texto_de(chunk_id)}" in prompt
        assert (
            chunk_id not in prompt
        )  # el empate ch-m3-1 / ch-m3-2 se resuelve por chunkId ascendente


def test_rag_query_entrega_al_runtime_el_esquema_con_el_patron_de_alias():
    _, llm, _ = _consultar("LLM-OK")

    (esquema,) = llm.esquemas
    campo = esquema["$defs"]["_OpcionCruda"]["properties"]["citedFragments"]
    assert campo["items"]["pattern"] == PATRON_DE_ALIAS


@pytest.mark.ac("US-236", 2)
def test_rag_query_cita_el_chunk_real_de_c2_con_su_texto_del_corpus_cuando_el_llm_cita_el_alias():
    cuerpo, _, _ = _consultar("LLM-ALIAS-C2")

    citas = [c for o in cuerpo["evidenceOptions"] for c in o["citedSources"]]
    assert [(c["chunkId"], c["chunkTextSnapshot"]) for c in citas] == [
        ("ch-m1-1", TEXTO_DE_CH_M1_1)
    ]
    assert cuerpo["discardedOptions"] == []


@pytest.mark.ac("US-236", 3)
def test_rag_query_descarta_con_cita_invalida_cuando_el_llm_cita_un_alias_inexistente():
    cuerpo, _, _ = _consultar("LLM-ALIAS-INEXISTENTE")

    assert cuerpo["evidenceOptions"] == []
    assert [d["discardReason"] for d in cuerpo["discardedOptions"]] == ["cita_invalida"]


@pytest.mark.ac("US-236", 4)
def test_rag_query_descarta_con_cita_invalida_sin_reparar_cuando_el_llm_cita_el_chunk_id_real():
    cuerpo, _, _ = _consultar("LLM-ID-REAL")

    assert cuerpo["evidenceOptions"] == []
    assert [d["discardReason"] for d in cuerpo["discardedOptions"]] == ["cita_invalida"]


@pytest.mark.ac("US-236", 5)
def test_rag_query_asigna_alias_identicos_a_la_misma_entrada_y_ni_respuesta_ni_logs_los_llevan(
    caplog,
):
    caplog.set_level(logging.DEBUG)
    cuerpo, llm1, texto = _consultar("LLM-ALIAS-C1-C2")
    _, llm2, _ = _consultar("LLM-ALIAS-C1-C2")

    assert llm1.prompts[0].count("[fragmento C") == 4
    assert llm1.prompts == llm2.prompts
    assert [c["chunkId"] for c in cuerpo["evidenceOptions"][0]["citedSources"]] == [
        "ch-m2-1",
        "ch-m1-1",
    ]
    assert not ALIAS_EN_TEXTO.search(texto)
    assert caplog.records
    assert not any(ALIAS_EN_TEXTO.search(r.getMessage()) for r in caplog.records)


@pytest.mark.ac("US-236", 6)
def test_rag_query_descarta_con_cita_invalida_cuando_el_alias_corresponde_a_un_chunk_bajo_el_umbral():
    cuerpo, llm, texto = _consultar("LLM-ALIAS-C4", con_cuarto_bajo_el_umbral=True)

    (prompt,) = llm.prompts
    assert "[fragmento C3]" in prompt and "[fragmento C4]" not in prompt
    assert [d["discardReason"] for d in cuerpo["discardedOptions"]] == ["cita_invalida"]
    assert "ch-m3-2" not in texto
