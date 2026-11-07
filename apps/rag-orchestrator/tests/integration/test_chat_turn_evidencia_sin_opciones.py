"""`POST /chat/turn`: chunks sobre el umbral y 0 opciones soportadas (US-271 AC-10 / L1D-329, RN-01, RN-19, RN-23).

El ``ChatTurnService`` y el servicio de `/rag/query` son los de producción; el NLI falso devuelve ``neutral`` para todo, de
modo que ninguna opción tiene soporte. El mensaje es determinista: el LLM no escribe ni una palabra. Cada respuesta se valida
contra el spec del proveedor (US-214). Solo datos sintéticos.
"""

import json
from datetime import date

import pytest

from app.application.ports import ReleaseDelCorpus
from tests.support.arnes_contextual import (
    PUNTAJES_ALTOS,
    Q_GENERICA,
    crear_entorno_contextual,
    puntajes_contextuales,
)
from tests.support.chat import solicitud_desde_ejemplo
from tests.support.chat_evidencia import crear_entorno_de_chat_con_evidencia
from tests.support.fakes import settings_de_prueba
from tests.support.nli_falso import NEUTRAL, NliFalso
from tests.support.recuperacion import EJEMPLOS, LectorReleaseFalso

TEXTO_FIJO = "Evidencia recuperada sin opciones soportadas"
RELEASE_SINTETICA = ReleaseDelCorpus(
    release_id="rel-test-1",
    cutoff_date=date(2026, 9, 30),
    excluded_sources=("FUENTE-EXCLUIDA-1", "FUENTE-EXCLUIDA-2"),
)
AVISOS_RN19 = [settings_de_prueba().chat_notice_ai, settings_de_prueba().chat_notice_academic]
ALCANCE = (
    "Alcance de la recuperación: el corpus tiene fecha de corte 2026-09-30; fuentes no incluidas: "
    "FUENTE-EXCLUIDA-1, FUENTE-EXCLUIDA-2; fragmentos de evidencia evaluados en la última consulta: 2."
)


def _entorno_sin_opciones():
    base = crear_entorno_contextual(
        habilitada=False,
        puntajes={**puntajes_contextuales(), Q_GENERICA: PUNTAJES_ALTOS},
        clasificador_nli=NliFalso(por_defecto=NEUTRAL),
        lector_release=LectorReleaseFalso(RELEASE_SINTETICA),
    )
    return base, crear_entorno_de_chat_con_evidencia(base)


def _ejemplo(nombre: str) -> dict:
    return json.loads((EJEMPLOS / nombre).read_text(encoding="utf-8"))


@pytest.mark.ac("US-271", 10)
def test_chat_turn_responde_con_el_texto_fijo_y_las_limitaciones_cuando_hay_chunks_y_cero_opciones_soportadas():
    base, chat = _entorno_sin_opciones()

    respuesta = chat.turno(solicitud_desde_ejemplo("chat-turn-request-evidencia-sin-opciones.json"))

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert [(b["kind"], b["text"]) for b in cuerpo["blocks"]] == [
        ("limitacion", TEXTO_FIJO),
        ("limitacion", ALCANCE),
    ]
    analisis = cuerpo["evidenceAnalysis"]
    assert analisis["status"] == "con_evidencia"  # no se confunde con sin_evidencia
    assert analisis["topRelevanceScore"] is not None
    assert analisis["evidenceOptions"] == []
    assert cuerpo["notices"] == AVISOS_RN19
    assert base.generador.invocaciones == 1  # generó opciones; ninguna tuvo soporte NLI
    assert cuerpo == _ejemplo("chat-turn-evidencia-sin-opciones.json")
