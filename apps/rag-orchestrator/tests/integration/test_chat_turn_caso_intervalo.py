"""`POST /chat/turn` con ``caso`` y hechos con intervalo: ``relativeEndDay`` (US-272, RN-11, RN-26, ADR-26).

Motor REAL con LLM y NLI falsos en sus puertos. Un hecho con ``relativeEndDay`` entero entra al periodo si su fin cae dentro;
con ``null`` explícito (en curso) siempre; sin el campo conserva la regla de L1D-318. Las peticiones se pasan como JSON
CRUDO: un modelo ya construido no distingue ``null`` de ausente. Solo datos sintéticos.
"""

import logging
import re

import pytest

from app.domain.chat.valores_iniciales import CHAT_SIN_DATOS_PERIODO_TEXTO_INICIAL
from tests.support.chat import crear_entorno_de_chat, solicitud_desde_ejemplo

ANCLA = "Periodo medido desde la fecha del diagnóstico"
AVISO_SIN_VERIFICAR = "Un dato en curso del periodo consultado está sin verificar"
TEXTO_SIN_DATOS = "No se encontró información documentada sobre lo preguntado en el expediente"
FECHA_ABSOLUTA = re.compile(r"\d{4}-\d{2}-\d{2}")


def _textos(cuerpo: dict) -> list[str]:
    return [b["text"] for b in cuerpo["blocks"]]


@pytest.mark.ac("US-272", 1)
def test_chat_turn_caso_incluye_la_quimioterapia_con_la_marca_cuando_su_fin_cae_dentro_de_los_ultimos_100_dias():
    entorno = crear_entorno_de_chat("CHAT-CASO-INTERVALO")

    respuesta = entorno.turno(solicitud_desde_ejemplo("chat-turn-request-caso-intervalo.json"))

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert cuerpo["blocks"][0] == {"kind": "limitacion", "text": ANCLA}
    quimio = next(b for b in cuerpo["blocks"] if b.get("factRefs") == ["f3"])
    assert "(iniciado antes del periodo)" in quimio["text"]
    assert "(en curso)" not in quimio["text"]
    assert "hasta 60 días antes del diagnóstico" in quimio["text"]
    assert "hasta 60 días antes del diagnóstico" in entorno.llm.usuarios[-1]


@pytest.mark.ac("US-272", 2)
def test_chat_turn_caso_incluye_el_tratamiento_con_las_dos_marcas_cuando_relativeendday_es_null_explicito():
    entorno = crear_entorno_de_chat("CHAT-CASO-INTERVALO")
    solicitud = solicitud_desde_ejemplo("chat-turn-request-caso-en-curso.json")
    assert solicitud["caseFacts"][2]["relativeEndDay"] is None

    cuerpo = entorno.turno(solicitud).json()

    quimio = next(b for b in cuerpo["blocks"] if b.get("factRefs") == ["f3"])
    assert "(iniciado antes del periodo) (en curso)" in quimio["text"]


@pytest.mark.ac("US-272", 2)
def test_chat_turn_caso_no_incluye_el_tratamiento_cuando_relativeendday_esta_ausente_y_empezo_antes_del_periodo():
    entorno = crear_entorno_de_chat("CHAT-CASO-INTERVALO")
    solicitud = solicitud_desde_ejemplo("chat-turn-request-caso-en-curso.json")
    del solicitud["caseFacts"][2]["relativeEndDay"]

    cuerpo = entorno.turno(solicitud).json()

    assert all(b.get("factRefs") != ["f3"] for b in cuerpo["blocks"])
    assert "[f3]" not in entorno.llm.usuarios[-1]
    assert not any("(en curso)" in t for t in _textos(cuerpo))
    assert ANCLA not in _textos(cuerpo)


def test_chat_turn_caso_excluye_sin_marca_el_tratamiento_que_termino_antes_del_periodo():
    entorno = crear_entorno_de_chat("CHAT-CASO-INTERVALO")
    solicitud = solicitud_desde_ejemplo("chat-turn-request-caso-intervalo.json")
    solicitud["caseFacts"][2]["relativeDay"] = -300
    solicitud["caseFacts"][2]["relativeEndDay"] = -200

    cuerpo = entorno.turno(solicitud).json()

    assert all(b.get("factRefs") != ["f3"] for b in cuerpo["blocks"])
    assert "[f3]" not in entorno.llm.usuarios[-1]
    assert not any("iniciado antes" in t for t in _textos(cuerpo))
    assert cuerpo["blocks"][0] == {"kind": "limitacion", "text": ANCLA}


def test_chat_turn_caso_avisa_sin_bloquear_cuando_el_hecho_en_curso_requiere_revision():
    entorno = crear_entorno_de_chat("CHAT-CASO-INTERVALO")
    solicitud = solicitud_desde_ejemplo("chat-turn-request-caso-en-curso.json")

    cuerpo = entorno.turno(solicitud).json()

    assert AVISO_SIN_VERIFICAR in cuerpo["notices"]
    assert any(b.get("factRefs") == ["f3"] for b in cuerpo["blocks"])


def test_chat_turn_caso_no_avisa_ni_pone_el_ancla_cuando_ningun_hecho_trae_relativeendday():
    entorno = crear_entorno_de_chat("CHAT-CASO-PERIODO")

    cuerpo = entorno.turno(solicitud_desde_ejemplo("chat-turn-request-caso-periodo.json")).json()

    assert AVISO_SIN_VERIFICAR not in cuerpo["notices"]
    assert ANCLA not in _textos(cuerpo)


@pytest.mark.ac("US-272", 3)
def test_chat_turn_caso_no_lleva_fechas_absolutas_al_prompt_ni_a_los_logs_cuando_hay_un_hecho_con_intervalo(
    caplog,
):
    entorno = crear_entorno_de_chat("CHAT-CASO-INTERVALO")
    caplog.set_level(logging.DEBUG)

    entorno.turno(solicitud_desde_ejemplo("chat-turn-request-caso-intervalo.json"))

    assert not FECHA_ABSOLUTA.search(entorno.llm.usuarios[-1])
    assert not FECHA_ABSOLUTA.search(entorno.llm.sistemas[-1] or "")
    assert not FECHA_ABSOLUTA.search(caplog.text)


@pytest.mark.ac("US-272", 4)
def test_chat_turn_caso_responde_con_el_texto_fijo_sin_invocar_al_llm_cuando_el_expediente_no_tiene_datos():
    entorno = crear_entorno_de_chat("CHAT-CASO-INTERVALO")
    solicitud = solicitud_desde_ejemplo("chat-turn-request-caso-intervalo.json")
    solicitud["caseFacts"] = []

    cuerpo = entorno.turno(solicitud).json()

    assert cuerpo["blocks"] == [{"kind": "limitacion", "text": TEXTO_SIN_DATOS}]
    assert entorno.llm.llamadas_de_generacion == 0


@pytest.mark.ac("US-272", 4)
def test_chat_turn_caso_responde_con_el_texto_del_periodo_sin_invocar_al_llm_cuando_hay_datos_solo_fuera_del_periodo():
    entorno = crear_entorno_de_chat("CHAT-CASO-INTERVALO")
    solicitud = solicitud_desde_ejemplo("chat-turn-request-caso-periodo.json")
    solicitud["question"] = "¿Qué ocurrió en los últimos 10 días?"
    for hecho in solicitud["caseFacts"]:
        hecho["relativeDay"] = -200

    cuerpo = entorno.turno(solicitud).json()

    assert cuerpo["blocks"] == [
        {"kind": "limitacion", "text": CHAT_SIN_DATOS_PERIODO_TEXTO_INICIAL}
    ]
    assert entorno.llm.llamadas_de_generacion == 0


@pytest.mark.ac("US-272", 4)
def test_chat_turn_caso_dice_el_ancla_y_el_texto_del_periodo_cuando_el_unico_hecho_queda_fuera_por_su_intervalo():
    entorno = crear_entorno_de_chat("CHAT-CASO-INTERVALO")
    solicitud = solicitud_desde_ejemplo("chat-turn-request-caso-intervalo.json")
    solicitud["caseFacts"] = [solicitud["caseFacts"][2]]
    solicitud["caseFacts"][0]["relativeDay"] = -300
    solicitud["caseFacts"][0]["relativeEndDay"] = -200

    cuerpo = entorno.turno(solicitud).json()

    assert cuerpo["blocks"] == [
        {"kind": "limitacion", "text": ANCLA},
        {"kind": "limitacion", "text": CHAT_SIN_DATOS_PERIODO_TEXTO_INICIAL},
    ]
    assert entorno.llm.llamadas_de_generacion == 0
