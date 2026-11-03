"""`POST /rag/follow-up` no guarda estado (US-218 AC-8, RN-11, Pre-S1 resp. 29): sin ficheros, sin escrituras, sin PII en logs."""

import logging

import pytest

from tests.support.seguimiento import crear_entorno_de_seguimiento, solicitud_de_seguimiento

FRASE_MARCADA = "frase-sintetica-marcada-9f3a"


def _solicitud(pseudonimo: str, trace_id: str, pregunta: str) -> dict:
    solicitud = solicitud_de_seguimiento(pregunta)
    solicitud["clinicalContext"]["pseudoPatientId"] = pseudonimo
    solicitud["traceId"] = trace_id
    solicitud["analysisMemory"][0]["question"] = f"Memoria {FRASE_MARCADA}"
    return solicitud


@pytest.mark.ac("US-218", 8)
def test_rag_follow_up_no_deja_ficheros_ni_logs_con_la_pregunta_la_memoria_o_el_seudonimo_cuando_se_procesan_dos_turnos(
    tmp_path, monkeypatch, caplog
):
    monkeypatch.chdir(tmp_path)
    caplog.set_level(logging.DEBUG)
    entorno = crear_entorno_de_seguimiento("SEG-OK")
    preguntas = (
        f"¿La evidencia describe diferencias por menopausia? {FRASE_MARCADA}",
        "¿La evidencia describe diferencias según el estado menopáusico?",
    )
    pseudonimos = ("psd_AaBbCcDdEeFf", "psd_ZzYyXxWwVvUu")

    primera = entorno.seguir(_solicitud(pseudonimos[0], "req_aaaa1111", preguntas[0]))
    segunda = entorno.seguir(_solicitud(pseudonimos[1], "req_bbbb2222", preguntas[1]))

    assert primera.status_code == 200 and segunda.status_code == 200
    assert list(tmp_path.iterdir()) == []
    registrado = "\n".join(r.getMessage() for r in caplog.records)
    for prohibido in (FRASE_MARCADA, *pseudonimos, "menopáusico", "anti-HER2 con quimioterapia"):
        assert prohibido not in registrado


def test_rag_follow_up_responde_igual_al_segundo_turno_que_procesado_solo_cuando_el_primero_no_deja_estado():
    pregunta = "¿La evidencia describe diferencias según el estado menopáusico?"
    solo = crear_entorno_de_seguimiento("SEG-OK")
    esperado = solo.seguir(_solicitud("psd_ZzYyXxWwVvUu", "req_bbbb2222", pregunta)).json()
    entorno = crear_entorno_de_seguimiento("SEG-OK")
    entorno.seguir(_solicitud("psd_AaBbCcDdEeFf", "req_aaaa1111", f"{pregunta} {FRASE_MARCADA}"))

    segundo = entorno.seguir(_solicitud("psd_ZzYyXxWwVvUu", "req_bbbb2222", pregunta)).json()

    assert segundo == esperado
