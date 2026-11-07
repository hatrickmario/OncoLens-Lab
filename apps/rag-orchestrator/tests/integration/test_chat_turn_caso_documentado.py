"""`POST /chat/turn` con la intención ``caso`` sobre exámenes, tratamientos y periodos (US-261, ADR-34, RN-01, RN-11).

Motor REAL (``ChatTurnService`` + nodo ``caso``) con el LLM y el NLI falsos en sus puertos. Un bloque ``documentado`` lo
escribe el código con la descripción determinista del hecho; uno ``interpretacion`` pasa el chequeo numérico y el NLI; el
periodo de la pregunta acota los hechos que llegan al prompt; sin ningún bloque el turno dice que no hay información
documentada. Solo datos sintéticos.
"""

import re

import pytest

from app.domain.chat.valores_iniciales import (
    CHAT_SIN_DATOS_PERIODO_TEXTO_INICIAL,
    CHAT_SIN_FECHA_TEXTO_INICIAL,
)
from tests.support.chat import crear_entorno_de_chat, solicitud_de_turno, solicitud_desde_ejemplo
from tests.support.nli_falso import IMPLICA, NEUTRAL, NliFalso

TEXTO_SIN_DATOS = "No se encontró información documentada sobre lo preguntado en el expediente"
ADT = "Deprivación androgénica, línea 1, 172 días antes del diagnóstico."
CIRUGIA = "Cirugía: cirugía conservadora, 40 días antes del diagnóstico."
DIAGNOSTICO = "Carcinoma ductal infiltrante de mama, Nottingham grado 2, estadio IIA (TNM 8), ECOG 1, al momento del diagnóstico."
PSA_INICIAL = "PSA: 4.2, alterado, 172 días antes del diagnóstico."
PSA_ULTIMO = "PSA: 12.4, alterado, 37 días después del diagnóstico."
FECHA_ABSOLUTA = re.compile(r"\d{4}-\d{2}-\d{2}")


@pytest.mark.ac("US-261", 1)
def test_chat_turn_caso_devuelve_el_bloque_documentado_con_la_descripcion_del_tratamiento_cuando_el_llm_solo_elige_el_factref():  # noqa: E501
    entorno = crear_entorno_de_chat("CHAT-CASO-ADT")

    respuesta = entorno.turno(solicitud_desde_ejemplo("chat-turn-request-caso-adt.json"))

    assert respuesta.status_code == 200
    assert respuesta.json()["blocks"] == [{"kind": "documentado", "text": ADT, "factRefs": ["f6"]}]


def test_chat_turn_caso_descarta_el_texto_del_llm_cuando_el_bloque_documentado_trae_texto_propio():
    entorno = crear_entorno_de_chat("CHAT-CASO-DOCUMENTADO-TEXTO-PROPIO")

    cuerpo = entorno.turno(solicitud_de_turno()).json()

    assert cuerpo["blocks"] == [{"kind": "documentado", "text": DIAGNOSTICO, "factRefs": ["f1"]}]
    assert "Texto propio" not in str(cuerpo)
    assert cuerpo["omittedClaims"] == 0


def test_chat_turn_caso_emite_un_bloque_por_hecho_en_orden_ascendente_de_dia_cuando_el_llm_cita_varios_hechos_documentados():  # noqa: E501
    entorno = crear_entorno_de_chat("CHAT-CASO-DOCUMENTADO-VARIOS")

    cuerpo = entorno.turno(solicitud_desde_ejemplo("chat-turn-request-caso-adt.json")).json()

    assert cuerpo["blocks"] == [
        {"kind": "documentado", "text": PSA_INICIAL, "factRefs": ["f2"]},
        {"kind": "documentado", "text": PSA_ULTIMO, "factRefs": ["f4"]},
    ]


@pytest.mark.ac("US-261", 2)
def test_chat_turn_caso_muestra_la_interpretacion_con_sus_dos_factrefs_y_los_avisos_cuando_el_nli_la_sostiene():  # noqa: E501
    nli = NliFalso(por_defecto=IMPLICA)
    entorno = crear_entorno_de_chat("CHAT-CASO-INTERPRETACION", nli=nli)

    respuesta = entorno.turno(solicitud_de_turno())

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert [b["kind"] for b in cuerpo["blocks"]] == ["interpretacion"]
    assert sorted(cuerpo["blocks"][0]["factRefs"]) == ["f1", "f2"]
    assert cuerpo["omittedClaims"] == 0
    assert (
        "Generado por IA; requiere validación clínica independiente por el oncólogo tratante"
        in (cuerpo["notices"])
    )
    assert len(nli.pares_recibidos) == 1


@pytest.mark.ac("US-261", 2)
def test_chat_turn_caso_omite_la_interpretacion_cuando_el_nli_responde_neutral():
    entorno = crear_entorno_de_chat("CHAT-CASO-INTERPRETACION", nli=NliFalso(por_defecto=NEUTRAL))

    cuerpo = entorno.turno(solicitud_de_turno()).json()

    assert [b["kind"] for b in cuerpo["blocks"]] == ["limitacion"]
    assert cuerpo["omittedClaims"] == 1


def test_chat_turn_caso_omite_la_interpretacion_sin_invocar_al_nli_cuando_inventa_una_cifra():
    nli = NliFalso(por_defecto=IMPLICA)
    entorno = crear_entorno_de_chat("CHAT-CASO-INTERPRETACION-CIFRA-INVENTADA", nli=nli)

    cuerpo = entorno.turno(solicitud_desde_ejemplo("chat-turn-request-caso-adt.json")).json()

    assert [b["kind"] for b in cuerpo["blocks"]] == ["limitacion"]
    assert cuerpo["omittedClaims"] == 1
    assert nli.invocaciones == 0


@pytest.mark.ac("US-261", 3)
def test_chat_turn_caso_solo_enlaza_hechos_dentro_del_periodo_y_deja_fuera_la_quimioterapia_cuando_se_pregunta_por_los_ultimos_100_dias():  # noqa: E501
    entorno = crear_entorno_de_chat("CHAT-CASO-PERIODO")

    respuesta = entorno.turno(solicitud_desde_ejemplo("chat-turn-request-caso-periodo.json"))

    assert respuesta.status_code == 200
    bloques = respuesta.json()["blocks"]
    assert [b["factRefs"] for b in bloques] == [["f4"], ["f1"]]
    assert bloques[0]["text"] == CIRUGIA
    prompt = entorno.llm.usuarios[-1]
    assert "[f4]" in prompt and "[f3]" not in prompt
    assert "quimioterapia" not in prompt


def test_chat_turn_caso_omite_la_afirmacion_que_cita_un_hecho_fuera_del_periodo():
    entorno = crear_entorno_de_chat("CHAT-CASO-PERIODO-CITA-FUERA")

    cuerpo = entorno.turno(solicitud_desde_ejemplo("chat-turn-request-caso-periodo.json")).json()

    assert [b["factRefs"] for b in cuerpo["blocks"]] == [["f4"]]
    assert cuerpo["omittedClaims"] == 1


def test_chat_turn_caso_envia_todos_los_hechos_al_prompt_cuando_la_pregunta_no_nombra_un_periodo():
    entorno = crear_entorno_de_chat("CHAT-CASO-PERIODO")
    solicitud = solicitud_desde_ejemplo("chat-turn-request-caso-periodo.json")
    solicitud["question"] = "¿Cuál es la situación actual de la paciente?"

    entorno.turno(solicitud)

    prompt = entorno.llm.usuarios[-1]
    assert all(f"[f{n}]" in prompt for n in range(1, 5))


@pytest.mark.ac("US-261", 4)
def test_chat_turn_caso_omite_la_afirmacion_sin_invocar_al_nli_y_dice_que_no_hay_informacion_cuando_no_trae_factrefs():  # noqa: E501
    nli = NliFalso(por_defecto=IMPLICA)
    entorno = crear_entorno_de_chat("CHAT-CASO-SIN-DATOS", nli=nli)

    respuesta = entorno.turno(solicitud_desde_ejemplo("chat-turn-request-caso-sin-datos.json"))

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert cuerpo["blocks"] == [{"kind": "limitacion", "text": TEXTO_SIN_DATOS}]
    assert cuerpo["omittedClaims"] == 1
    assert nli.invocaciones == 0


def test_chat_turn_caso_usa_el_texto_de_sin_datos_de_la_configuracion_cuando_no_queda_ningun_bloque():
    entorno = crear_entorno_de_chat(
        "CHAT-CASO-SIN-DATOS", chat_sin_datos_texto="Sin datos documentados"
    )

    cuerpo = entorno.turno(solicitud_desde_ejemplo("chat-turn-request-caso-sin-datos.json")).json()

    assert cuerpo["blocks"] == [{"kind": "limitacion", "text": "Sin datos documentados"}]


@pytest.mark.ac("US-261", 5)
@pytest.mark.parametrize(
    ("escenario", "peticion"),
    [
        ("CHAT-CASO-ADT", "chat-turn-request-caso-adt.json"),
        ("CHAT-CASO-PERIODO", "chat-turn-request-caso-periodo.json"),
        ("CHAT-CASO-SIN-DATOS", "chat-turn-request-caso-sin-datos.json"),
    ],
)
def test_chat_turn_caso_no_envia_fechas_absolutas_al_llm_cuando_pregunta_por_tratamiento_periodo_o_examen(
    escenario, peticion
):
    entorno = crear_entorno_de_chat(escenario)

    respuesta = entorno.turno(solicitud_desde_ejemplo(peticion))

    assert respuesta.status_code == 200
    assert entorno.llm.llamadas_de_generacion == 1
    assert not FECHA_ABSOLUTA.search(entorno.llm.usuarios[-1])
    assert not FECHA_ABSOLUTA.search(entorno.llm.sistemas[-1] or "")
    assert "días" in entorno.llm.usuarios[-1] or "diagnóstico" in entorno.llm.usuarios[-1]


def test_chat_turn_caso_omite_la_interpretacion_sin_invocar_al_nli_cuando_usa_un_verbo_de_tendencia():
    nli = NliFalso(por_defecto=IMPLICA)
    entorno = crear_entorno_de_chat("CHAT-CASO-INTERPRETACION-TENDENCIA", nli=nli)

    cuerpo = entorno.turno(solicitud_de_turno()).json()

    assert [b["kind"] for b in cuerpo["blocks"]] == ["limitacion"]
    assert cuerpo["omittedClaims"] == 1
    assert nli.invocaciones == 0


def test_chat_turn_fuentes_no_emite_interpretacion_cuando_el_llm_la_elige_en_un_nodo_distinto_de_caso():
    entorno = crear_entorno_de_chat("CHAT-FUENTES-INTERPRETACION")

    cuerpo = entorno.turno(solicitud_de_turno("¿Qué fuentes respaldan esto?")).json()

    assert cuerpo["intent"] == "fuentes_limitaciones"
    assert [b["kind"] for b in cuerpo["blocks"]] == ["documentado"]


def test_chat_turn_fuentes_dice_que_no_hay_datos_cuando_no_queda_ningun_bloque():
    entorno = crear_entorno_de_chat("CHAT-FUENTES-SIN-ENLACE")

    cuerpo = entorno.turno(solicitud_de_turno("¿Qué fuentes respaldan esto?")).json()

    assert cuerpo["blocks"] == [{"kind": "limitacion", "text": TEXTO_SIN_DATOS}]
    assert cuerpo["omittedClaims"] == 1


def test_chat_turn_caso_avisa_sin_bloquear_cuando_el_periodo_deja_fuera_hechos_sin_fecha_confiable():
    entorno = crear_entorno_de_chat("CHAT-CASO-PERIODO")
    solicitud = solicitud_desde_ejemplo("chat-turn-request-caso-periodo.json")
    solicitud["caseFacts"].append(
        {
            "factRef": "f5",
            "kind": "evento",
            "verbalization": "cirugía: sin fecha",
            "relativeDay": None,
            "reviewStatus": "verificado",
        }
    )

    cuerpo = entorno.turno(solicitud).json()

    assert CHAT_SIN_FECHA_TEXTO_INICIAL.replace("<n>", "1") in cuerpo["notices"]
    assert [b["factRefs"] for b in cuerpo["blocks"]] == [["f4"], ["f1"]]
    assert "[f5]" not in entorno.llm.usuarios[-1]


def test_chat_turn_caso_no_avisa_de_hechos_sin_fecha_cuando_la_pregunta_no_nombra_un_periodo():
    entorno = crear_entorno_de_chat("CHAT-CASO-PERIODO")
    solicitud = solicitud_desde_ejemplo("chat-turn-request-caso-periodo.json")
    solicitud["question"] = "¿Cuál es la situación actual de la paciente?"
    solicitud["caseFacts"][3]["relativeDay"] = None

    cuerpo = entorno.turno(solicitud).json()

    assert not any("sin fecha confiable" in aviso for aviso in cuerpo["notices"])


def test_chat_turn_caso_distingue_el_periodo_vacio_del_expediente_sin_datos_cuando_hay_hechos_fuera_del_periodo():
    entorno = crear_entorno_de_chat("CHAT-CASO-SIN-DATOS")
    solicitud = solicitud_desde_ejemplo("chat-turn-request-caso-periodo.json")
    solicitud["question"] = "¿Qué ocurrió en los últimos 10 días?"
    for hecho in solicitud["caseFacts"]:
        hecho["relativeDay"] = -200

    cuerpo = entorno.turno(solicitud).json()

    assert cuerpo["blocks"] == [
        {"kind": "limitacion", "text": CHAT_SIN_DATOS_PERIODO_TEXTO_INICIAL}
    ]
    assert CHAT_SIN_DATOS_PERIODO_TEXTO_INICIAL != TEXTO_SIN_DATOS


def test_chat_turn_caso_no_usa_la_fecha_absoluta_de_la_pregunta_como_periodo_ni_como_fecha_de_un_hecho():
    entorno = crear_entorno_de_chat("CHAT-CASO-PERIODO")
    solicitud = solicitud_desde_ejemplo("chat-turn-request-caso-periodo.json")
    solicitud["question"] = "¿Qué ocurrió desde el 2025-03-14?"

    entorno.turno(solicitud)

    prompt = entorno.llm.usuarios[-1]
    assert all(f"[f{n}]" in prompt for n in range(1, 5))
    datos = prompt.split("<patient_data>")[1].split("</patient_data>")[0]
    assert not FECHA_ABSOLUTA.search(datos)


def test_chat_turn_enruta_a_caso_sin_consultar_al_llm_y_dice_que_no_hay_datos_cuando_se_pregunta_por_un_examen_inexistente():  # noqa: E501
    entorno = crear_entorno_de_chat("CHAT-RUTA-FALTANTES-SIN-DATOS")

    cuerpo = entorno.turno(solicitud_desde_ejemplo("chat-turn-request-caso-sin-datos.json")).json()

    assert cuerpo["intent"] == "caso"
    assert entorno.llm.llamadas_de_clasificacion == 0
    assert cuerpo["blocks"] == [{"kind": "limitacion", "text": TEXTO_SIN_DATOS}]


def test_chat_turn_enruta_a_caso_sin_consultar_al_llm_cuando_la_pregunta_nombra_un_periodo():
    entorno = crear_entorno_de_chat("CHAT-RUTA-FALTANTES-PERIODO")

    cuerpo = entorno.turno(solicitud_desde_ejemplo("chat-turn-request-caso-periodo.json")).json()

    assert cuerpo["intent"] == "caso"
    assert entorno.llm.llamadas_de_clasificacion == 0
    assert [b["factRefs"] for b in cuerpo["blocks"]] == [["f4"], ["f1"]]


@pytest.mark.parametrize("intencion", ["fuentes_limitaciones"])
def test_chat_turn_dice_que_no_hay_datos_cuando_el_nodo_de_la_intencion_no_deja_ningun_bloque(
    intencion,
):
    entorno = crear_entorno_de_chat("CHAT-FUENTES-SIN-ENLACE")
    pregunta = {
        "faltantes": "¿Qué fuentes respaldan esto?",
        "fuentes_limitaciones": "¿Qué fuentes respaldan esto?",
    }[intencion]

    cuerpo = entorno.turno(solicitud_de_turno(pregunta)).json()

    assert cuerpo["blocks"] == [{"kind": "limitacion", "text": TEXTO_SIN_DATOS}]
