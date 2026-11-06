"""`POST /chat/turn` (US-259 AC-4, AC-6): hilo efímero con TTL, límite de hilos vivos y `rehydration` acotada.

El reloj es ``RelojFijo`` y el test lo adelanta; los adapters son falsos y cuentan sus llamadas. Cada respuesta se valida
contra el spec del proveedor (US-214).
"""

from datetime import timedelta

import pytest

from tests.support.chat import (
    HILO_A,
    HILO_B,
    HILO_C,
    Q_CASO,
    Q_FALTANTES,
    REHIDRATACION_VACIA,
    crear_entorno_de_chat,
    solicitud_de_turno,
)


def _sin_hilo(pregunta: str, hilo: str) -> dict:
    return solicitud_de_turno(pregunta, hilo=hilo, rehidratacion=None)


@pytest.mark.ac("US-259", 4)
def test_chat_turn_responde_404_hilo_desconocido_sin_llamar_a_ningun_adapter_cuando_el_ttl_vencio():
    entorno = crear_entorno_de_chat("CHAT-OK", chat_thread_ttl_seconds=60)
    assert entorno.turno(solicitud_de_turno(Q_CASO)).status_code == 200
    llamadas_antes = entorno.llamadas_a_adapters()
    entorno.reloj.valor += timedelta(seconds=61)

    respuesta = entorno.turno(_sin_hilo(Q_FALTANTES, HILO_A))

    assert respuesta.status_code == 404
    cuerpo = respuesta.json()
    assert cuerpo["error"] == "HILO_DESCONOCIDO"
    assert set(cuerpo) == {"error", "message", "traceId"}
    assert HILO_A not in respuesta.text and Q_FALTANTES not in respuesta.text
    assert entorno.llamadas_a_adapters() == llamadas_antes


def test_chat_turn_conserva_el_hilo_y_renueva_su_ttl_cuando_el_turno_llega_antes_de_que_venza():
    entorno = crear_entorno_de_chat("CHAT-OK", chat_thread_ttl_seconds=60)
    entorno.turno(solicitud_de_turno(Q_CASO))

    for _ in range(3):
        entorno.reloj.valor += timedelta(seconds=40)
        assert entorno.turno(_sin_hilo(Q_FALTANTES, HILO_A)).status_code == 200


def test_chat_turn_responde_404_cuando_el_hilo_nunca_se_creo_y_el_turno_no_trae_rehydration():
    entorno = crear_entorno_de_chat("CHAT-OK")

    respuesta = entorno.turno(_sin_hilo(Q_CASO, HILO_B))

    assert respuesta.status_code == 404
    assert entorno.llamadas_a_adapters() == {"llm": 0, "contador": 0}


def test_chat_turn_reconstruye_un_hilo_vencido_cuando_el_turno_trae_rehydration():
    entorno = crear_entorno_de_chat("CHAT-OK", chat_thread_ttl_seconds=60)
    entorno.turno(solicitud_de_turno(Q_CASO))
    entorno.reloj.valor += timedelta(seconds=61)

    respuesta = entorno.turno(solicitud_de_turno(Q_FALTANTES, rehidratacion=REHIDRATACION_VACIA))

    assert respuesta.status_code == 200


@pytest.mark.ac("US-259", 6)
def test_chat_turn_desaloja_el_hilo_mas_antiguo_y_conserva_los_otros_cuando_se_supera_chat_max_threads():
    entorno = crear_entorno_de_chat("CHAT-OK", chat_max_threads=2)
    for hilo in (HILO_A, HILO_B, HILO_C):
        assert entorno.turno(solicitud_de_turno(Q_CASO, hilo=hilo)).status_code == 200
        entorno.reloj.valor += timedelta(seconds=1)
    llamadas_antes = entorno.llamadas_a_adapters()

    desalojado = entorno.turno(_sin_hilo(Q_FALTANTES, HILO_A))

    assert desalojado.status_code == 404
    assert desalojado.json()["error"] == "HILO_DESCONOCIDO"
    assert entorno.llamadas_a_adapters() == llamadas_antes
    assert entorno.turno(_sin_hilo(Q_FALTANTES, HILO_B)).status_code == 200
    assert entorno.turno(_sin_hilo(Q_FALTANTES, HILO_C)).status_code == 200


def test_chat_turn_desaloja_al_menos_reciente_y_no_al_mas_antiguo_creado_cuando_un_hilo_se_uso_despues():
    entorno = crear_entorno_de_chat("CHAT-OK", chat_max_threads=2)
    entorno.turno(solicitud_de_turno(Q_CASO, hilo=HILO_A))
    entorno.reloj.valor += timedelta(seconds=1)
    entorno.turno(solicitud_de_turno(Q_CASO, hilo=HILO_B))
    entorno.reloj.valor += timedelta(seconds=1)
    entorno.turno(_sin_hilo(Q_FALTANTES, HILO_A))  # A es ahora el más reciente
    entorno.reloj.valor += timedelta(seconds=1)

    entorno.turno(solicitud_de_turno(Q_CASO, hilo=HILO_C))

    assert entorno.turno(_sin_hilo(Q_FALTANTES, HILO_B)).status_code == 404
    assert entorno.turno(_sin_hilo(Q_FALTANTES, HILO_A)).status_code == 200


@pytest.mark.parametrize(
    "extra",
    [
        {"resourceId": "SENTINELA-RECURSO"},
        {"uuid": "6f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e5f"},
        {"fecha": "2026-03-14"},
        {"analysisId": "SENTINELA-ANALISIS"},
        {"dataLinks": [{"factRef": "f1"}]},
    ],
    ids=["resourceId", "uuid", "fecha-absoluta", "analysisId", "dataLinks"],
)
def test_chat_turn_responde_422_sin_eco_y_sin_llamar_a_adapters_cuando_rehydration_trae_campos_no_permitidos(
    extra,
):
    entorno = crear_entorno_de_chat("CHAT-OK")
    turno_previo = {
        "question": Q_CASO,
        "intent": "caso",
        "blocksText": ["Carcinoma ductal infiltrante de mama."],
        "factRefs": ["f1"],
        **extra,
    }
    solicitud = solicitud_de_turno(
        Q_FALTANTES, rehidratacion={**REHIDRATACION_VACIA, "turns": [turno_previo]}
    )

    respuesta = entorno.turno(solicitud)

    assert respuesta.status_code == 422
    assert respuesta.json()["error"] == "CUERPO_INVALIDO"
    for valor in ("SENTINELA", "6f1c2d3e", "2026-03-14"):
        assert valor not in respuesta.text
    assert entorno.llamadas_a_adapters() == {"llm": 0, "contador": 0}
