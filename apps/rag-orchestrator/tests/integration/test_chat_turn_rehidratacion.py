"""`POST /chat/turn` (US-259 AC-5): un hilo reconstruido desde `rehydration` equivale al hilo vivo.

Dos entornos independientes con el mismo LLM falso: en el primero el hilo vive tres turnos; el segundo recibe el cuarto
turno con la `rehydration` que clinical-api construiría a partir de los tres primeros (últimos turnos enmascarados y
estado estructurado). Deben enviar el mismo prompt al LLM y responder lo mismo.
"""

import pytest

from tests.support.chat import (
    HILO_A,
    Q_CASO,
    Q_EVIDENCIA,
    Q_FALTANTES,
    REHIDRATACION_VACIA,
    crear_entorno_de_chat,
    solicitud_de_turno,
)

PREGUNTAS_PREVIAS = (Q_CASO, Q_FALTANTES, Q_EVIDENCIA)
CUARTA_PREGUNTA = "¿Cuál es la situación actual de la paciente en este momento?"


def _fact_refs_de(cuerpo: dict) -> list[str]:
    vistos: list[str] = []
    for bloque in cuerpo["blocks"]:
        vistos += [r for r in bloque.get("factRefs", []) if r not in vistos]
    return vistos


@pytest.mark.ac("US-259", 5)
def test_chat_turn_produce_el_mismo_hash_de_prompt_y_la_misma_respuesta_cuando_el_hilo_se_reconstruye_desde_rehydration():
    vivo = crear_entorno_de_chat("CHAT-OK")
    turnos_previos = []
    for indice, pregunta in enumerate(PREGUNTAS_PREVIAS):
        solicitud = solicitud_de_turno(
            pregunta, rehidratacion=None if indice else REHIDRATACION_VACIA
        )
        respuesta_previa = vivo.turno(solicitud)
        assert respuesta_previa.status_code == 200
        cuerpo = respuesta_previa.json()
        turnos_previos.append(
            {
                "question": pregunta,
                "intent": cuerpo["intent"],
                "blocksText": [b["text"] for b in cuerpo["blocks"]],
                "factRefs": _fact_refs_de(cuerpo),
            }
        )
        estado = cuerpo["structuredState"]
    respuesta_viva = vivo.turno(solicitud_de_turno(CUARTA_PREGUNTA, rehidratacion=None))

    reconstruido = crear_entorno_de_chat("CHAT-OK")
    rehidratacion = {"turns": turnos_previos, "structuredState": estado}
    respuesta_rehidratada = reconstruido.turno(
        solicitud_de_turno(CUARTA_PREGUNTA, hilo=HILO_A, rehidratacion=rehidratacion)
    )

    assert respuesta_viva.status_code == 200 and respuesta_rehidratada.status_code == 200
    assert (
        vivo.llm.hash_del_ultimo_prompt_de_generacion()
        == reconstruido.llm.hash_del_ultimo_prompt_de_generacion()
    )
    assert respuesta_viva.json() == respuesta_rehidratada.json()
