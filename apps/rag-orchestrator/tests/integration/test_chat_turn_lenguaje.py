"""`POST /chat/turn` y el lenguaje (Gate 2 de L1D-316, RN-23, RN-19, RN-02): filtro prescriptivo, aviso de evidencia no
consultada, memoria sin puntaje crudo y mensajes del sistema en voz impersonal."""

import pytest

from app.domain.chat.mensajes import MENSAJE_EVIDENCIA_NO_CONSULTADA
from tests.support.chat import (
    Q_CASO,
    Q_EVIDENCIA,
    Q_OTRA_PERSONA,
    Q_SIN_REGLA,
    crear_entorno_de_chat,
    solicitud_de_turno,
)
from tests.support.prompt_separado import bloques


def _rehidratacion_con_ultima_evidencia(chunks: list[str], puntaje: float | None) -> dict:
    return {
        "turns": [],
        "structuredState": {
            "intentsVistos": ["evidencia"],
            "preguntasPrevias": [Q_EVIDENCIA],
            "opcionesMostradas": [],
            "citasMostradas": [],
            "faltantesSenalados": [],
            "ultimaEvidencia": {"query": "terapia", "chunkIds": chunks, "topRelevanceScore": puntaje},
        },
    }


def _memoria_del_ultimo_prompt(entorno) -> str:
    (memoria,) = [b.texto for b in bloques(entorno.llm.usuarios[-1]) if b.etiqueta == "memory"]
    return memoria


def test_chat_turn_omite_y_cuenta_la_afirmacion_prescriptiva_cuando_cita_un_hecho_del_turno():
    entorno = crear_entorno_de_chat("CHAT-PRESCRIPTIVO")

    respuesta = entorno.turno(solicitud_de_turno(Q_CASO))

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert [b["factRefs"] for b in cuerpo["blocks"]] == [["f1"]]
    assert cuerpo["omittedClaims"] == 1
    assert "debe recibir" not in respuesta.text


def test_chat_turn_agrega_el_bloque_limitacion_fijo_cuando_la_intencion_es_evidencia():
    entorno = crear_entorno_de_chat("CHAT-OK")

    cuerpo = entorno.turno(solicitud_de_turno(Q_EVIDENCIA)).json()

    assert cuerpo["blocks"][-1] == {"kind": "limitacion", "text": MENSAJE_EVIDENCIA_NO_CONSULTADA}
    assert Q_EVIDENCIA not in MENSAJE_EVIDENCIA_NO_CONSULTADA


@pytest.mark.parametrize("pregunta", ["¿Qué información falta del caso?", Q_CASO])
def test_chat_turn_no_agrega_el_bloque_de_evidencia_no_consultada_cuando_la_intencion_no_es_evidencia(
    pregunta,
):
    entorno = crear_entorno_de_chat("CHAT-OK")

    cuerpo = entorno.turno(solicitud_de_turno(pregunta)).json()

    assert all(b["kind"] != "limitacion" for b in cuerpo["blocks"])


def test_chat_turn_no_envia_el_puntaje_crudo_al_prompt_y_dice_con_evidencia_cuando_hay_ultima_evidencia():
    entorno = crear_entorno_de_chat("CHAT-OK")

    entorno.turno(
        solicitud_de_turno(Q_CASO, rehidratacion=_rehidratacion_con_ultima_evidencia(["c1"], 0.8731))
    )

    memoria = _memoria_del_ultimo_prompt(entorno)
    assert "0.8731" not in memoria and "puntaje" not in memoria.lower()
    assert "con evidencia" in memoria


def test_chat_turn_dice_sin_evidencia_en_la_memoria_cuando_el_puntaje_es_null():
    entorno = crear_entorno_de_chat("CHAT-OK")

    entorno.turno(solicitud_de_turno(Q_CASO, rehidratacion=_rehidratacion_con_ultima_evidencia([], None)))

    memoria = _memoria_del_ultimo_prompt(entorno)
    assert "sin evidencia" in memoria and "null" not in memoria


def test_chat_turn_usa_voz_impersonal_en_los_mensajes_del_sistema_cuando_responde_fuera_de_alcance_o_no_clasificada():
    fuera = crear_entorno_de_chat("CHAT-OK").turno(solicitud_de_turno(Q_OTRA_PERSONA)).json()
    sin_clasificar = (
        crear_entorno_de_chat("CHAT-RUTA-INVALIDA").turno(solicitud_de_turno(Q_SIN_REGLA)).json()
    )

    assert "puede formularse sobre ese caso" in fuera["blocks"][0]["text"]
    assert "puede reformularse" in sin_clasificar["blocks"][0]["text"]
