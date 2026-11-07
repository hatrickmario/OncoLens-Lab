"""`POST /chat/turn` con la intención ``caso`` ante datos en conflicto (US-262, RN-08, AC-T3.2, RN-01, RN-26).

Motor REAL (``ChatTurnService`` + nodo ``caso``) con el LLM y el NLI falsos en sus puertos. Las contradicciones que marcó
Backend 1 (``CaseFact.conflictWith``) se componen con una función pura, sin LLM, con los dos valores; la IA nunca resuelve
un conflicto: una interpretación que enlaza a un hecho en conflicto sin su contraparte se omite antes del NLI. Solo datos
sintéticos.
"""

import json

import pytest

from tests.support.chat import crear_entorno_de_chat, solicitud_desde_ejemplo
from tests.support.nli_falso import IMPLICA, NliFalso
from tests.support.recuperacion import EJEMPLOS

PETICION_CON_CONFLICTO = "chat-turn-request-caso-conflicto.json"
PETICION_SIN_CONFLICTO = "chat-turn-request-caso-sin-contradicciones.json"
Q_CONTRADICCIONES = "¿Hay contradicciones en el expediente?"
Q_ESTADIO_CORRECTO = "¿Cuál es el estadio correcto de la paciente?"
TEXTO_SIN_CONTRADICCIONES = "No hay contradicciones registradas en el expediente"
TEXTO_DEL_CONFLICTO = (
    "Por conciliar: Carcinoma ductal infiltrante, Nottingham grado 2, estadio IIA (TNM_8), "
    "al momento del diagnóstico. Frente a: Carcinoma ductal infiltrante, estadio IIB (TNM_8), "
    "10 días después del diagnóstico, requiere revisión."
)


def _ejemplo(nombre: str) -> dict:
    return json.loads((EJEMPLOS / nombre).read_text(encoding="utf-8"))


@pytest.mark.ac("US-262", 1)
def test_chat_turn_caso_compone_un_bloque_conflicto_con_los_dos_valores_sin_invocar_al_llm_cuando_se_pregunta_por_contradicciones():  # noqa: E501
    entorno = crear_entorno_de_chat("CHAT-OK")
    solicitud = solicitud_desde_ejemplo(PETICION_CON_CONFLICTO)

    respuesta = entorno.turno(solicitud)

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert cuerpo["blocks"] == [
        {"kind": "conflicto", "text": TEXTO_DEL_CONFLICTO, "factRefs": ["f1", "f6"]}
    ]
    assert entorno.llm.llamadas_de_generacion == 0
    assert entorno.llm.invocaciones == 0
    assert cuerpo == _ejemplo("chat-turn-caso-conflicto.json")


@pytest.mark.ac("US-262", 2)
def test_chat_turn_caso_omite_el_estadio_correcto_es_iib_y_no_lo_envia_al_nli_cuando_enlaza_a_un_hecho_en_conflicto_sin_su_contraparte():  # noqa: E501
    nli = NliFalso(por_defecto=IMPLICA)
    entorno = crear_entorno_de_chat("CHAT-CONFLICTO-RESUELVE", nli=nli)
    solicitud = solicitud_desde_ejemplo(PETICION_CON_CONFLICTO)
    solicitud["question"] = Q_ESTADIO_CORRECTO

    respuesta = entorno.turno(solicitud)

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert "El estadio correcto es IIB" not in json.dumps(cuerpo, ensure_ascii=False)
    assert [b["kind"] for b in cuerpo["blocks"]] == ["limitacion"]
    assert cuerpo["omittedClaims"] == 1
    assert nli.invocaciones == 0


@pytest.mark.ac("US-262", 4)
def test_chat_turn_caso_responde_que_no_hay_contradicciones_con_cero_llamadas_al_llm_cuando_ningun_hecho_esta_en_conflicto():  # noqa: E501
    entorno = crear_entorno_de_chat("CHAT-OK")
    solicitud = solicitud_desde_ejemplo(PETICION_SIN_CONFLICTO)

    respuesta = entorno.turno(solicitud)

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert cuerpo["blocks"] == [{"kind": "limitacion", "text": TEXTO_SIN_CONTRADICCIONES}]
    assert entorno.llm.llamadas_de_generacion == 0
    assert entorno.llm.invocaciones == 0
    assert cuerpo == _ejemplo("chat-turn-caso-sin-contradicciones.json")
