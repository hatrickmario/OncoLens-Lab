"""Paridad de la validación del seguimiento: `/rag/follow-up` y `/chat/turn` omiten lo mismo (L1D-322, RN-01, RN-23, RN-24).

Ambos usan ``validar_afirmaciones_citadas``: las mismas afirmaciones (huérfana de cita, NLI neutral, prescriptiva) dan el
mismo ``omittedClaims`` por las dos rutas.
"""

import pytest

from tests.support.chat_evidencia import (
    ANALISIS_ACTIVO,
    entorno_de_seguimiento,
    solicitud_de_evidencia,
)
from tests.support.chat_evidencia import Q_SEGUIMIENTO as Q_CHAT
from tests.support.guiones_seguimiento import TEXTO_SOLO_EN_LA_MEMORIA as MEMORIA_FOLLOW_UP
from tests.support.llm_chat_evidencia_falso import TEXTO_SIN_SOPORTE_NLI
from tests.support.nli_falso import IMPLICA, NEUTRAL, NliFalso
from tests.support.recuperacion import Q_HER2
from tests.support.seguimiento import crear_entorno_de_seguimiento, solicitud_de_seguimiento

CASOS = [
    # (escenario del follow-up, escenario del chat, NLI neutral sobre el texto de cada ruta)
    ("SEG-MEMORIA-SIN-CITA", "CHAT-MEMORIA", {}),
    (
        "SEG-SOLO-MEMORIA",
        "SEG-NLI-NEUTRAL",
        {MEMORIA_FOLLOW_UP: NEUTRAL, TEXTO_SIN_SOPORTE_NLI: NEUTRAL},
    ),
    ("SEG-PRESCRIPTIVO", "SEG-PRESCRIPTIVO", {}),
]


@pytest.mark.parametrize(("escenario_follow_up", "escenario_chat", "neutrales"), CASOS)
def test_chat_turn_y_rag_follow_up_omiten_lo_mismo_cuando_reciben_las_mismas_afirmaciones(
    escenario_follow_up, escenario_chat, neutrales
):
    por_follow_up = crear_entorno_de_seguimiento(
        escenario_follow_up, nli=NliFalso(resultados=neutrales, por_defecto=IMPLICA)
    )
    omitidas_follow_up = por_follow_up.seguir(solicitud_de_seguimiento()).json()["omittedClaims"]

    entorno, _ = entorno_de_seguimiento(
        escenario_chat, nli=NliFalso(resultados=neutrales, por_defecto=IMPLICA)
    )
    entorno.turno(solicitud_de_evidencia(Q_HER2))
    chat = entorno.turno(
        solicitud_de_evidencia(Q_CHAT, analisis_activo=ANALISIS_ACTIVO, rehidratacion=None)
    )

    assert chat.status_code == 200
    assert chat.json()["omittedClaims"] == omitidas_follow_up == 1
