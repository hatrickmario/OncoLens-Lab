"""`POST /chat/turn` (US-259 AC-7): memoria acotada por tokens y nunca citable (RN-24, RN-04).

La memoria llega por `rehydration` (12 turnos previos); el contador de tokens cuenta palabras. El prompt se lee del LLM
falso: la memoria va solo en el bloque ``<memory citable="no">`` del mensaje de usuario, jamás en el de sistema.
"""

import pytest

from tests.support.chat import Q_CASO, crear_entorno_de_chat, solicitud_de_turno
from tests.support.prompt_separado import bloques

PRESUPUESTO = 100
TURNOS_PREVIOS = 12
TEXTO_LARGO = " ".join(["palabra"] * 30)


def _turno_previo(numero: int) -> dict:
    return {
        "question": f"Pregunta previa número {numero:02d}",
        "intent": "caso",
        "blocksText": [TEXTO_LARGO],
        "factRefs": ["f1"],
    }


def _rehidratacion_con_doce_turnos() -> dict:
    turnos = [_turno_previo(n) for n in range(1, TURNOS_PREVIOS + 1)]
    return {
        "turns": turnos,
        "structuredState": {
            "intentsVistos": ["caso", "faltantes"],
            "preguntasPrevias": [t["question"] for t in turnos],
            "opcionesMostradas": ["opcion-descrita-7"],
            "citasMostradas": ["chunk-citado-3"],
            "faltantesSenalados": ["ki67"],
        },
    }


def _bloque_de_memoria(usuario: str) -> str:
    (memoria,) = [b for b in bloques(usuario) if b.etiqueta == "memory"]
    assert memoria.atributos == 'citable="no"'
    return memoria.texto


@pytest.mark.ac("US-259", 7)
def test_chat_turn_incluye_el_estado_estructurado_completo_y_solo_los_ultimos_turnos_que_caben_en_el_bloque_no_citable():
    entorno = crear_entorno_de_chat("CHAT-OK", chat_memory_max_tokens=PRESUPUESTO)

    respuesta = entorno.turno(
        solicitud_de_turno(Q_CASO, rehidratacion=_rehidratacion_con_doce_turnos())
    )

    assert respuesta.status_code == 200
    (usuario,), (sistema,) = entorno.llm.usuarios, entorno.llm.sistemas
    memoria = _bloque_de_memoria(usuario)
    for elemento in ("opcion-descrita-7", "chunk-citado-3", "ki67", "faltantes"):
        assert elemento in memoria
    for numero in range(
        1, TURNOS_PREVIOS + 1
    ):  # el estado estructurado trae todas las preguntas previas
        assert f"Pregunta previa número {numero:02d}" in memoria
    # ... pero la ventana de turnos recortada por tokens solo conserva los últimos que caben (cada turno cuesta ~35 palabras).
    assert memoria.count(TEXTO_LARGO) == 2
    assert memoria.rindex(TEXTO_LARGO) > memoria.rindex("Pregunta previa número 11")
    assert Q_CASO not in memoria and Q_CASO not in sistema
    assert "Pregunta previa" not in sistema and TEXTO_LARGO not in sistema
    assert "INICIO_DE_LA_MEMORIA" not in usuario + sistema
    assert "FIN_DE_LA_MEMORIA" not in usuario + sistema


@pytest.mark.ac("US-259", 7)
def test_chat_turn_omite_la_afirmacion_respaldada_solo_por_memoria_y_la_cuenta_en_omitted_claims():
    entorno = crear_entorno_de_chat("CHAT-MEMORIA")

    respuesta = entorno.turno(solicitud_de_turno(Q_CASO))

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert [b["factRefs"] for b in cuerpo["blocks"]] == [["f1"]]
    assert "tamoxifeno" not in respuesta.text
    assert cuerpo["omittedClaims"] == 1
