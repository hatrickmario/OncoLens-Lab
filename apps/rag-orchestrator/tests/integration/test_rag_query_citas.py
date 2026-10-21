"""`POST /rag/query`, citas de la rama con evidencia (US-063 / L1D-179): RN-01, RN-04, RN-24, RN-25.

Corpus FX-06a-a, catálogo y generador falsos (FX-06a-b); cada respuesta la valida contra el spec del proveedor el hook
de `verificacion_proveedor.py` (US-214).
"""

import pytest

from tests.support.generador_falso import TITULO_INVENTADO, FakeEvidenceGenerator
from tests.support.recuperacion import CORPUS_FX06A, Q_HER2, crear_entorno, solicitud_de

RESPUESTA = "#/components/schemas/RagQueryInternalResponse"
TEXTO_DE_CH_M1_1 = next(c.texto for c in CORPUS_FX06A if c.chunk_id == "ch-m1-1")


def _consultar(escenario: str, pregunta: str = Q_HER2):
    entorno = crear_entorno(generador=FakeEvidenceGenerator(escenario))
    respuesta = entorno.consultar(solicitud_de(pregunta))
    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    return cuerpo, respuesta.text


@pytest.mark.ac("US-063", 1)
def test_rag_query_copia_los_datos_de_la_cita_del_corpus_cuando_llm_ok_cita_ch_m1_1():
    cuerpo, _ = _consultar("LLM-OK")

    cita = cuerpo["evidenceOptions"][0]["citedSources"][0]
    assert cita["title"] == "Breast Cancer Treatment (test)"
    assert cita["sourceName"] == "NCI PDQ"
    assert cita["externalId"] == "CDR-TEST-001"
    assert cita["language"] == "en"
    assert cita["sourceType"] == "guideline"
    assert cita["chunkId"] == "ch-m1-1"
    assert cita["chunkTextSnapshot"] == TEXTO_DE_CH_M1_1


@pytest.mark.ac("US-063", 2)
def test_rag_query_descarta_con_cita_invalida_la_opcion_que_cita_un_chunk_no_recuperado():
    cuerpo, _ = _consultar("LLM-CITA-AJENA")

    assert cuerpo["evidenceOptions"] == []
    assert [d["discardReason"] for d in cuerpo["discardedOptions"]] == ["cita_invalida"]


@pytest.mark.ac("US-063", 3)
def test_rag_query_descarta_con_sin_citas_la_opcion_con_cited_sources_vacio():
    cuerpo, _ = _consultar("LLM-SIN-CITAS")

    assert cuerpo["evidenceOptions"] == []
    assert [d["discardReason"] for d in cuerpo["discardedOptions"]] == ["sin_citas"]


@pytest.mark.ac("US-063", 4)
def test_rag_query_conserva_titulo_y_fuente_del_corpus_cuando_el_llm_inventa_metadatos():
    cuerpo, texto = _consultar("LLM-TITULO-FALSO")

    cita = cuerpo["evidenceOptions"][0]["citedSources"][0]
    assert cita["title"] == "Breast Cancer Treatment (test)"
    assert cita["sourceName"] == "NCI PDQ"
    assert TITULO_INVENTADO not in texto


@pytest.mark.ac("US-063", 5)
def test_rag_query_conserva_la_opcion_con_solo_la_cita_valida_cuando_cita_tambien_un_chunk_ajeno():
    cuerpo, _ = _consultar("LLM-CITA-MIXTA")

    assert cuerpo["discardedOptions"] == []
    citas = cuerpo["evidenceOptions"][0]["citedSources"]
    assert [c["chunkId"] for c in citas] == ["ch-m1-1"]


@pytest.mark.ac("US-063", 6)
def test_rag_query_conserva_el_chunk_en_ingles_cuando_la_pregunta_esta_en_espanol():
    cuerpo, _ = _consultar("LLM-OK", pregunta=Q_HER2)

    assert cuerpo["meta"]["queryLanguage"] == "es"
    cita = cuerpo["evidenceOptions"][0]["citedSources"][0]
    assert cita["language"] == "en"
    assert cita["chunkTextSnapshot"] == TEXTO_DE_CH_M1_1
