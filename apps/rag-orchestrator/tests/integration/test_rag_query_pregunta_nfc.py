"""US-250: `/rag/query` normaliza la pregunta (NFC, espacios) antes de cualquier etapa; NFC y NFD dan el mismo análisis."""

import hashlib
import unicodedata

import pytest

from tests.support.generador_llm import generador_con_llm
from tests.support.llm_falso import FakeLlmClient
from tests.support.recuperacion import Q_HER2, crear_entorno, solicitud_de

Q_HER2_NFD = unicodedata.normalize("NFD", Q_HER2)
# Espacio, tabulador, U+00A0, U+2007, U+202F, U+3000 y salto de línea: solo separadores (sin escapes literales).
SOLO_ESPACIOS = "".join(chr(c) for c in (0x20, 0x09, 0xA0, 0x2007, 0x202F, 0x3000, 0x0A, 0x20))


def _consultar_con(pregunta: str):
    llm = FakeLlmClient("LLM-OK")
    entorno = crear_entorno(generador=generador_con_llm(llm))
    respuesta = entorno.consultar(solicitud_de(pregunta, max_options=1))
    return entorno, llm, respuesta


def test_la_pregunta_de_prueba_difiere_en_nfc_y_nfd():
    assert Q_HER2_NFD != Q_HER2
    assert len(Q_HER2_NFD) > len(Q_HER2)


@pytest.mark.ac("US-250", 4)
def test_rag_query_arma_el_prompt_con_la_pregunta_en_nfc_cuando_llega_en_nfd():
    _, llm, respuesta = _consultar_con(Q_HER2_NFD)

    assert respuesta.status_code == 200
    assert llm.invocaciones == 1
    assert Q_HER2 in llm.usuarios[0]
    assert Q_HER2_NFD not in llm.usuarios[0]


@pytest.mark.ac("US-250", 5)
def test_rag_query_produce_el_mismo_hash_de_prompt_y_la_misma_consulta_cuando_llega_en_nfc_o_nfd():
    entorno_nfc, llm_nfc, _ = _consultar_con(Q_HER2)
    entorno_nfd, llm_nfd, _ = _consultar_con(Q_HER2_NFD)

    assert llm_nfc.invocaciones == llm_nfd.invocaciones == 1
    hash_nfc = hashlib.sha256(llm_nfc.usuarios[0].encode("utf-8")).hexdigest()
    hash_nfd = hashlib.sha256(llm_nfd.usuarios[0].encode("utf-8")).hexdigest()
    assert hash_nfc == hash_nfd
    assert entorno_nfd.embedder.textos[0] == entorno_nfc.embedder.textos[0] == Q_HER2
    assert entorno_nfd.reranker.preguntas == entorno_nfc.reranker.preguntas == [Q_HER2]


@pytest.mark.ac("US-250", 2)
def test_rag_query_responde_422_sin_llamar_adapters_cuando_la_pregunta_son_solo_espacios():
    llm = FakeLlmClient("LLM-OK")
    entorno = crear_entorno(generador=generador_con_llm(llm))

    respuesta = entorno.consultar(solicitud_de(SOLO_ESPACIOS))

    assert respuesta.status_code == 422
    assert respuesta.json()["error"] == "CUERPO_INVALIDO"
    assert entorno.embedder.invocaciones == 0
    assert entorno.buscador.invocaciones == 0
    assert entorno.reranker.invocaciones == 0
    assert llm.invocaciones == 0
