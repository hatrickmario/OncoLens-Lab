"""`POST /chat/turn` con la intención ``caso`` (US-260, ADR-34): cada afirmación enlaza a un dato del paciente y pasa el NLI.

Motor REAL (``ChatTurnService`` + nodo ``caso``) con el LLM y el NLI falsos en sus puertos. El LLM devuelve afirmaciones con
``factRefs``; el nodo omite lo que no enlaza (sin invocar el NLI) y lo que el NLI no sostiene, y suma ``omittedClaims``.
Solo datos sintéticos.
"""

from typing import Any

import pytest

from tests.support.chat import Q_CASO, crear_entorno_de_chat, solicitud_de_turno
from tests.support.nli_falso import IMPLICA, NEUTRAL, NliFalso

INVENTADA = "Recibió radioterapia adyuvante."
PARAFRASIS = "La paciente tiene HER2 positivo por inmunohistoquímica."
SIN_ENLACE = "La paciente tiene antecedentes familiares de cáncer de mama."
ENLAZADA = "El diagnóstico documentado es un carcinoma ductal infiltrante de mama."
DIAGNOSTICO = "Carcinoma ductal infiltrante de mama, Nottingham grado 2, estadio IIA (TNM 8), ECOG 1, al momento del diagnóstico."
DESCRIPCION_HER2 = "HER2: 3+ (IHQ), relevante, al momento del diagnóstico."
Q_PSA = "¿Cómo ha evolucionado el PSA?"


def _hecho(ref: str, verbalizacion: str, dia: int | None, serie: str | None = None) -> dict:
    hecho: dict[str, Any] = {
        "factRef": ref,
        "kind": "biomarcador",
        "verbalization": verbalizacion,
        "relativeDay": dia,
        "reviewStatus": "verificado",
    }
    if serie:
        hecho["seriesKey"] = serie
    return hecho


def _solicitud_con_tres_psa() -> dict:
    solicitud = solicitud_de_turno(Q_PSA)
    solicitud["clinicalContext"]["diagnosis"]["cancerType"] = "prostata"
    solicitud["caseFacts"] = [
        _hecho("f1", "PSA: 8,5 ng/mL", 0, "psa"),
        _hecho("f2", "PSA: 6,1 ng/mL", 90, "psa"),
        _hecho("f3", "PSA: 4,2 ng/mL", 180, "psa"),
    ]
    return solicitud


@pytest.mark.ac("US-260", 2)
def test_chat_turn_caso_omite_la_afirmacion_y_suma_omitidas_cuando_el_nli_no_la_sostiene_con_sus_hechos_citados():  # noqa: E501
    nli = NliFalso(resultados={INVENTADA: NEUTRAL}, por_defecto=IMPLICA)
    entorno = crear_entorno_de_chat("CHAT-CASO-INVENTA", nli=nli)

    respuesta = entorno.turno(solicitud_de_turno(Q_CASO))

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert [b["text"] for b in cuerpo["blocks"]] == [DIAGNOSTICO]
    assert INVENTADA not in str(cuerpo)
    assert cuerpo["omittedClaims"] == 1
    # La premisa del NLI es la verbalización determinista del hecho que la afirmación cita (ADR-34), no el texto del LLM.
    par = next(p for p in nli.pares_recibidos if p.hipotesis == INVENTADA)
    assert par.premisa == DESCRIPCION_HER2


@pytest.mark.ac("US-260", 3)
def test_chat_turn_caso_omite_la_afirmacion_sin_evaluarla_con_el_nli_cuando_no_trae_ningun_factref_valido():  # noqa: E501
    nli = NliFalso(por_defecto=IMPLICA)
    entorno = crear_entorno_de_chat("CHAT-CASO-SIN-ENLACE", nli=nli)

    respuesta = entorno.turno(solicitud_de_turno(Q_CASO))

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert [b["text"] for b in cuerpo["blocks"]] == [ENLAZADA]
    assert cuerpo["omittedClaims"] == 1
    evaluadas = [p.hipotesis for p in nli.pares_recibidos]
    assert evaluadas == [ENLAZADA]  # solo la enlazada llegó al NLI; la otra, jamás


@pytest.mark.ac("US-260", 6)
def test_chat_turn_caso_ordena_los_factrefs_por_dia_relativo_ascendente_cuando_el_llm_los_devuelve_desordenados():  # noqa: E501
    entorno = crear_entorno_de_chat("CHAT-CASO-PSA")

    respuesta = entorno.turno(_solicitud_con_tres_psa())

    assert respuesta.status_code == 200
    bloques = respuesta.json()["blocks"]
    assert [b["factRefs"] for b in bloques] == [["f1"], ["f2"], ["f3"]]


@pytest.mark.ac("US-260", 1)
def test_chat_turn_caso_devuelve_bloques_documentados_con_factrefs_y_los_tres_avisos_cuando_el_nli_sostiene_las_afirmaciones():  # noqa: E501
    nli = NliFalso(por_defecto=IMPLICA)
    entorno = crear_entorno_de_chat("CHAT-CASO-OK", nli=nli)

    respuesta = entorno.turno(solicitud_de_turno(Q_CASO))

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert cuerpo["intent"] == "caso"
    assert all(b["kind"] == "documentado" and b["factRefs"] for b in cuerpo["blocks"])
    assert cuerpo["omittedClaims"] == 0
    assert "Verifique contra las fuentes" in cuerpo["notices"]
    assert nli.invocaciones == 0  # la frase canónica es idéntica a la descripción de sus hechos: no hay qué inferir


def test_chat_turn_caso_responde_503_sin_afirmaciones_cuando_el_nli_falla():
    nli = NliFalso(error=RuntimeError("sin modelo"))
    entorno = crear_entorno_de_chat("CHAT-CASO-OK", nli=nli)

    respuesta = entorno.turno(solicitud_de_turno(Q_CASO))

    assert respuesta.status_code == 503
    assert respuesta.json()["error"] == "LOCAL_LLM_UNAVAILABLE"


def test_chat_turn_caso_muestra_la_frase_canonica_sin_invocar_al_nli_cuando_es_identica_a_la_descripcion_de_sus_hechos():  # noqa: E501
    nli = NliFalso(por_defecto=NEUTRAL)  # lo que haría el NLI real con una frase corta
    entorno = crear_entorno_de_chat("CHAT-CASO-OK", nli=nli)

    respuesta = entorno.turno(solicitud_de_turno(Q_CASO))

    cuerpo = respuesta.json()
    assert [b["text"] for b in cuerpo["blocks"]] == [DIAGNOSTICO, DESCRIPCION_HER2]
    assert cuerpo["omittedClaims"] == 0
    assert nli.invocaciones == 0


def test_chat_turn_caso_envia_la_parafrasis_al_nli_con_la_descripcion_como_premisa_y_la_omite_si_no_la_sostiene():  # noqa: E501
    nli = NliFalso(por_defecto=NEUTRAL)
    entorno = crear_entorno_de_chat("CHAT-CASO-PARAFRASIS", nli=nli)

    respuesta = entorno.turno(solicitud_de_turno(Q_CASO))

    cuerpo = respuesta.json()
    assert cuerpo["blocks"] == []
    assert cuerpo["omittedClaims"] == 1
    assert [(p.premisa, p.hipotesis) for p in nli.pares_recibidos] == [
        (DESCRIPCION_HER2, PARAFRASIS)
    ]


def test_chat_turn_caso_muestra_la_parafrasis_cuando_el_nli_la_sostiene():
    entorno = crear_entorno_de_chat("CHAT-CASO-PARAFRASIS", nli=NliFalso(por_defecto=IMPLICA))

    cuerpo = entorno.turno(solicitud_de_turno(Q_CASO)).json()

    assert [b["text"] for b in cuerpo["blocks"]] == [PARAFRASIS]


def test_chat_turn_caso_omite_la_afirmacion_demasiado_larga_sin_enviarla_al_nli_aunque_tenga_factrefs_validos():  # noqa: E501
    nli = NliFalso(por_defecto=IMPLICA)
    entorno = crear_entorno_de_chat("CHAT-CASO-LARGA", nli=nli)

    cuerpo = entorno.turno(solicitud_de_turno(Q_CASO)).json()

    assert cuerpo["blocks"] == []
    assert cuerpo["omittedClaims"] == 1
    assert nli.invocaciones == 0


def test_chat_turn_caso_describe_cada_hecho_del_ejemplo_con_la_misma_funcion_que_usa_el_prompt():
    entorno = crear_entorno_de_chat("CHAT-CASO-OK")
    solicitud = solicitud_de_turno(Q_CASO)

    entorno.turno(solicitud)

    prompt = entorno.llm.usuarios[-1]
    for hecho in solicitud["caseFacts"]:
        assert f"[{hecho['factRef']}]" in prompt
    assert DIAGNOSTICO in prompt and DESCRIPCION_HER2 in prompt
    assert "auto_aceptado" not in prompt and "revisión:" not in prompt
