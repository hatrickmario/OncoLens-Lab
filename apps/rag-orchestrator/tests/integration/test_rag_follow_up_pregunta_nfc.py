"""`POST /rag/follow-up` normaliza la pregunta con la regla única de US-250 (`normalizar_pregunta`), sin duplicarla."""

import hashlib
import unicodedata

import pytest

from tests.support.seguimiento import crear_entorno_de_seguimiento, solicitud_de_seguimiento

PREGUNTA = "¿La evidencia describe diferencias según el estado menopáusico?"


def _huella_del_prompt_de(pregunta_recibida: str) -> tuple[str, list[str]]:
    entorno = crear_entorno_de_seguimiento("SEG-OK")
    assert entorno.seguir(solicitud_de_seguimiento(pregunta_recibida)).status_code == 200
    assert entorno.llm.invocaciones == 1
    reranker = entorno.base.reranker
    return (
        hashlib.sha256(entorno.llm.prompts[0].encode()).hexdigest(),
        reranker.preguntas,  # type: ignore[attr-defined]
    )


@pytest.mark.ac("US-218", 1)
def test_rag_follow_up_da_el_mismo_sha256_de_prompt_y_la_misma_consulta_al_reranker_cuando_la_pregunta_llega_en_nfd_o_en_nfc():
    nfd = f"  {unicodedata.normalize('NFD', PREGUNTA)}   "

    huella_nfd, consultas_nfd = _huella_del_prompt_de(nfd)
    huella_nfc, consultas_nfc = _huella_del_prompt_de(PREGUNTA)

    assert huella_nfd == huella_nfc
    assert consultas_nfd == consultas_nfc == [PREGUNTA]


@pytest.mark.ac("US-218", 1)
def test_rag_follow_up_responde_422_sin_invocar_adapters_cuando_la_pregunta_son_solo_espacios():
    entorno = crear_entorno_de_seguimiento("SEG-OK")

    respuesta = entorno.seguir(solicitud_de_seguimiento("     "))

    assert respuesta.status_code == 422
    assert respuesta.json()["error"] == "CUERPO_INVALIDO"
    assert all(n == 0 for n in entorno.llamadas_a_adapters().values())
    assert "   " not in respuesta.text
