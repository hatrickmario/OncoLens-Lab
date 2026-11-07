"""Los ejemplos `chat-turn-*` del contrato son lo que el motor REAL produce (US-259, ADR-26): sin tautología.

Cada petición de ejemplo se envía tal cual (solo cambia ``catalogVersion`` por el del catálogo montado) al
``ChatTurnService`` real con el LLM falso del fixture, y la respuesta se compara con el ejemplo emparejado.
"""

import json

import pytest

from app.application.ports import FalloDelLlm
from tests.support.chat import crear_entorno_de_chat, solicitud_desde_ejemplo
from tests.support.llm_chat_falso import FakeChatLlm
from tests.support.recuperacion import EJEMPLOS


def _ejemplo(nombre: str) -> dict:
    return json.loads((EJEMPLOS / nombre).read_text(encoding="utf-8"))


def _sin_traza(cuerpo: dict) -> dict:
    return {k: v for k, v in cuerpo.items() if k != "traceId"}


@pytest.mark.parametrize(
    ("escenario", "peticion", "respuesta"),
    [
        ("CHAT-CASO-OK", "chat-turn-request.json", "chat-turn-caso-ok.json"),
        (
            "CHAT-CASO-SITUACION",
            "chat-turn-request-caso-situacion.json",
            "chat-turn-caso-situacion.json",
        ),
        ("CHAT-CASO-ADT", "chat-turn-request-caso-adt.json", "chat-turn-caso-adt.json"),
        (
            "CHAT-CASO-INTERPRETACION-EJEMPLO",
            "chat-turn-request-caso-interpretacion.json",
            "chat-turn-caso-interpretacion.json",
        ),
        (
            "CHAT-CASO-SIN-DATOS",
            "chat-turn-request-caso-sin-datos.json",
            "chat-turn-caso-sin-datos.json",
        ),
        (
            "CHAT-CASO-PERIODO",
            "chat-turn-request-caso-periodo.json",
            "chat-turn-caso-periodo.json",
        ),
        (
            "CHAT-RUTA-INVALIDA",
            "chat-turn-request-no-clasificada.json",
            "chat-turn-no-clasificada.json",
        ),
        ("CHAT-OK", "chat-turn-request-fuera-de-alcance.json", "chat-turn-fuera-de-alcance.json"),
    ],
)
def test_chat_turn_produce_exactamente_el_ejemplo_emparejado_cuando_recibe_su_peticion_de_ejemplo(
    escenario, peticion, respuesta
):
    entorno = crear_entorno_de_chat(escenario)

    resultado = entorno.turno(solicitud_desde_ejemplo(peticion))

    assert resultado.status_code == 200
    assert resultado.json() == _ejemplo(respuesta)


def test_chat_turn_produce_el_404_del_ejemplo_cuando_el_hilo_es_desconocido_y_la_peticion_no_trae_rehydration():
    entorno = crear_entorno_de_chat("CHAT-OK")

    resultado = entorno.turno(solicitud_desde_ejemplo("chat-turn-request-sin-rehidratacion.json"))

    assert resultado.status_code == 404
    assert _sin_traza(resultado.json()) == _sin_traza(_ejemplo("chat-turn-hilo-desconocido.json"))


def test_chat_turn_produce_el_503_del_ejemplo_cuando_el_llm_local_no_esta_disponible():
    entorno = crear_entorno_de_chat("CHAT-OK", llm=FakeChatLlm("CHAT-OK", error=FalloDelLlm()))

    resultado = entorno.turno(solicitud_desde_ejemplo("chat-turn-request.json"))

    assert resultado.status_code == 503
    assert _sin_traza(resultado.json()) == _sin_traza(
        _ejemplo("chat-turn-llm-local-no-disponible.json")
    )


def test_chat_turn_acepta_la_peticion_de_ejemplo_con_turnos_previos_cuando_trae_rehydration():
    entorno = crear_entorno_de_chat("CHAT-OK")

    resultado = entorno.turno(solicitud_desde_ejemplo("chat-turn-request-rehidratacion.json"))

    assert resultado.status_code == 200
    estado = resultado.json()["structuredState"]
    assert estado["intentsVistos"] == ["caso", "faltantes"]
    assert estado["preguntasPrevias"][0] == "¿Cuál es la situación actual de la paciente?"


@pytest.mark.parametrize(
    ("sin_evidencia", "respuesta_del_seguimiento"),
    [
        (False, "chat-turn-seguimiento-evidencia.json"),
        (True, "chat-turn-seguimiento-sin-evidencia.json"),
    ],
)
def test_chat_turn_produce_los_ejemplos_de_evidencia_y_seguimiento_cuando_recibe_sus_peticiones_de_ejemplo(
    sin_evidencia, respuesta_del_seguimiento
):
    from tests.support.chat_evidencia import entorno_de_seguimiento

    puntajes = {"ch-m1-1": 0.05, "ch-inj-1": 0.05}
    entorno, _ = entorno_de_seguimiento(
        "SEG-OK", **({"puntajes": puntajes} if sin_evidencia else {})
    )

    primero = entorno.turno(solicitud_desde_ejemplo("chat-turn-request-evidencia.json"))
    segundo = entorno.turno(solicitud_desde_ejemplo("chat-turn-request-seguimiento.json"))

    assert primero.status_code == segundo.status_code == 200
    assert primero.json() == _ejemplo("chat-turn-evidencia.json")
    assert segundo.json() == _ejemplo(respuesta_del_seguimiento)
