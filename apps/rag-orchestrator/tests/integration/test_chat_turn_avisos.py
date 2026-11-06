"""`POST /chat/turn` (US-259, RN-19, RN-12): los avisos de IA los emite siempre Backend 2 desde su configuración.

Todo turno con contenido generado lleva ``notices[]`` con los literales de configuración sin punto final y declara
``llmProvider``; los mensajes del sistema (``fuera_de_alcance``, ``no_clasificada``) llevan ``notices = []``.
"""

import pytest

from tests.support.chat import (
    Q_CASO,
    Q_EVIDENCIA,
    Q_FALTANTES,
    Q_OTRA_PERSONA,
    Q_SIN_REGLA,
    crear_entorno_de_chat,
    solicitud_de_turno,
)

Q_FUENTES = "¿Qué fuentes respaldan esta respuesta?"
AVISO_IA = "Generado por IA; requiere validación clínica independiente por el oncólogo tratante"
AVISO_ACADEMICO = "Uso académico/investigación"
AVISO_FUENTES = "Verifique contra las fuentes"


@pytest.mark.parametrize(
    ("pregunta", "intencion"),
    [
        (Q_CASO, "caso"),
        (Q_FALTANTES, "faltantes"),
        (Q_EVIDENCIA, "evidencia"),
        (Q_FUENTES, "fuentes_limitaciones"),
    ],
)
def test_chat_turn_devuelve_los_avisos_de_configuracion_y_el_proveedor_local_cuando_el_turno_tiene_contenido_generado(
    pregunta, intencion
):
    entorno = crear_entorno_de_chat("CHAT-OK")

    respuesta = entorno.turno(solicitud_de_turno(pregunta))

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert cuerpo["intent"] == intencion
    assert cuerpo["notices"] == [AVISO_IA, AVISO_ACADEMICO, AVISO_FUENTES]
    assert not any(aviso.endswith(".") for aviso in cuerpo["notices"])
    assert cuerpo["llmProvider"] == "local"


def test_chat_turn_toma_los_avisos_de_la_configuracion_y_no_de_un_literal_cuando_se_cambian_las_claves():
    entorno = crear_entorno_de_chat(
        "CHAT-OK",
        chat_notice_ai="Aviso de prueba uno",
        chat_notice_academic="Aviso de prueba dos",
        chat_notice_verify="Aviso de prueba tres",
    )

    respuesta = entorno.turno(solicitud_de_turno(Q_CASO))

    assert respuesta.status_code == 200
    assert respuesta.json()["notices"] == [
        "Aviso de prueba uno",
        "Aviso de prueba dos",
        "Aviso de prueba tres",
    ]


@pytest.mark.parametrize(
    ("escenario", "pregunta", "intencion"),
    [
        ("CHAT-OK", Q_OTRA_PERSONA, "fuera_de_alcance"),
        ("CHAT-RUTA-INVALIDA", Q_SIN_REGLA, "no_clasificada"),
    ],
)
def test_chat_turn_devuelve_notices_vacio_y_proveedor_local_cuando_el_turno_es_un_mensaje_del_sistema(
    escenario, pregunta, intencion
):
    entorno = crear_entorno_de_chat(escenario)

    respuesta = entorno.turno(solicitud_de_turno(pregunta))

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert cuerpo["intent"] == intencion
    assert cuerpo["notices"] == []
    assert cuerpo["llmProvider"] == "local"
