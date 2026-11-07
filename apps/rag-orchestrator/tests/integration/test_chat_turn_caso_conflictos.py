"""`POST /chat/turn` con la intención ``caso`` ante datos en conflicto (US-262, RN-08, AC-T3.2, RN-01, RN-26).

Motor REAL (``ChatTurnService`` + nodo ``caso``) con el LLM y el NLI falsos en sus puertos. Las contradicciones que marcó
Backend 1 (``CaseFact.conflictWith``) se componen con una función pura, sin LLM, con los dos valores; la IA nunca resuelve
un conflicto: una interpretación que enlaza a un hecho en conflicto sin su contraparte se omite antes del NLI. Solo datos
sintéticos.
"""

import json

import pytest

from tests.support.chat import crear_entorno_de_chat, solicitud_desde_ejemplo
from tests.support.nli_falso import IMPLICA, NEUTRAL, NliFalso
from tests.support.recuperacion import EJEMPLOS

PETICION_CON_CONFLICTO = "chat-turn-request-caso-conflicto.json"
PETICION_SIN_CONFLICTO = "chat-turn-request-caso-sin-contradicciones.json"
Q_CONTRADICCIONES = "¿Hay contradicciones en el expediente?"
Q_ESTADIO_CORRECTO = "¿Cuál es el estadio correcto de la paciente?"
TEXTO_SIN_CONTRADICCIONES = "No hay contradicciones registradas en el expediente"
ALCANCE_REVISADO = "Se revisaron los diagnósticos y biomarcadores del expediente"
TEXTO_SIN_CONTRAPARTE = (
    "Hay datos marcados en conflicto cuya contraparte no está entre los datos consultados"
)
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


def test_chat_turn_caso_envia_al_nli_la_interpretacion_que_cita_ambos_valores_del_par_cuando_el_llm_la_propone():  # noqa: E501
    nli = NliFalso(por_defecto=IMPLICA)
    entorno = crear_entorno_de_chat("CHAT-CONFLICTO-AMBOS", nli=nli)
    solicitud = solicitud_desde_ejemplo(PETICION_CON_CONFLICTO)
    solicitud["question"] = Q_ESTADIO_CORRECTO

    cuerpo = entorno.turno(solicitud).json()

    assert [b["kind"] for b in cuerpo["blocks"]] == ["interpretacion"]
    assert sorted(cuerpo["blocks"][0]["factRefs"]) == ["f1", "f6"]
    assert cuerpo["omittedClaims"] == 0
    assert len(nli.pares_recibidos) == 1


def test_chat_turn_caso_omite_la_interpretacion_que_cita_ambos_valores_cuando_el_nli_no_la_sostiene():  # noqa: E501
    entorno = crear_entorno_de_chat("CHAT-CONFLICTO-AMBOS", nli=NliFalso(por_defecto=NEUTRAL))
    solicitud = solicitud_desde_ejemplo(PETICION_CON_CONFLICTO)
    solicitud["question"] = Q_ESTADIO_CORRECTO

    cuerpo = entorno.turno(solicitud).json()

    assert [b["kind"] for b in cuerpo["blocks"]] == ["limitacion"]
    assert cuerpo["omittedClaims"] == 1


def test_chat_turn_caso_no_llama_al_nli_ni_al_llm_cuando_se_pregunta_por_contradicciones():
    nli = NliFalso(por_defecto=IMPLICA)
    entorno = crear_entorno_de_chat("CHAT-OK", nli=nli)

    entorno.turno(solicitud_desde_ejemplo(PETICION_CON_CONFLICTO))

    assert nli.invocaciones == 0


def test_chat_turn_caso_no_pasa_por_el_periodo_cuando_se_pregunta_por_contradicciones_de_un_periodo():
    entorno = crear_entorno_de_chat("CHAT-OK")
    solicitud = solicitud_desde_ejemplo(PETICION_CON_CONFLICTO)
    solicitud["question"] = "¿Hay contradicciones en los últimos 5 días?"

    cuerpo = entorno.turno(solicitud).json()

    assert [b["kind"] for b in cuerpo["blocks"]] == ["conflicto"]


@pytest.mark.ac("US-262", 4)
def test_chat_turn_caso_responde_que_no_hay_contradicciones_con_cero_llamadas_al_llm_cuando_ningun_hecho_esta_en_conflicto():  # noqa: E501
    entorno = crear_entorno_de_chat("CHAT-OK")
    solicitud = solicitud_desde_ejemplo(PETICION_SIN_CONFLICTO)

    respuesta = entorno.turno(solicitud)

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert cuerpo["blocks"] == [
        {"kind": "limitacion", "text": f"{TEXTO_SIN_CONTRADICCIONES}. {ALCANCE_REVISADO}."}
    ]
    assert entorno.llm.llamadas_de_generacion == 0
    assert entorno.llm.invocaciones == 0
    assert cuerpo == _ejemplo("chat-turn-caso-sin-contradicciones.json")


def _solicitud_con_marca_huerfana() -> dict:
    solicitud = solicitud_desde_ejemplo(PETICION_CON_CONFLICTO)
    solicitud["caseFacts"] = [h for h in solicitud["caseFacts"] if h["factRef"] != "f6"]
    return solicitud


def test_chat_turn_caso_declara_la_contraparte_ausente_y_no_dice_sin_contradicciones_cuando_un_hecho_marcado_no_tiene_su_par():  # noqa: E501
    entorno = crear_entorno_de_chat("CHAT-OK")

    cuerpo = entorno.turno(_solicitud_con_marca_huerfana()).json()

    assert cuerpo["blocks"] == [{"kind": "limitacion", "text": TEXTO_SIN_CONTRAPARTE}]
    assert "No hay contradicciones" not in json.dumps(cuerpo, ensure_ascii=False)
    assert entorno.llm.invocaciones == 0


def test_chat_turn_caso_avisa_de_la_contraparte_ausente_junto_a_los_bloques_conflicto_cuando_hay_un_par_y_una_marca_huerfana():  # noqa: E501
    entorno = crear_entorno_de_chat("CHAT-OK")
    solicitud = _solicitud_con_marca_huerfana()
    solicitud["caseFacts"] += [
        {
            "factRef": "f7",
            "kind": "biomarcador",
            "verbalization": "HER2: 2+, relevante",
            "relativeDay": 5,
            "reviewStatus": "requiere_revision",
            "conflictWith": "f8",
        },
        {
            "factRef": "f8",
            "kind": "biomarcador",
            "verbalization": "HER2: 3+, relevante",
            "relativeDay": 6,
            "reviewStatus": "requiere_revision",
            "conflictWith": "f7",
        },
    ]

    cuerpo = entorno.turno(solicitud).json()

    assert [b["kind"] for b in cuerpo["blocks"]] == ["conflicto"]
    assert TEXTO_SIN_CONTRAPARTE in cuerpo["notices"]
