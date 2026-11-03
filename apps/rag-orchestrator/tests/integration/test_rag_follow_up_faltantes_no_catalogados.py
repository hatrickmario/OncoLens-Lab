"""`POST /rag/follow-up` con `missingCriticalData` fuera del catálogo (US-116 / L1D-113 AC-3, RN-11): `422` siempre.

La misma petición inválida da `422 CUERPO_INVALIDO` por cualquiera de los dos caminos de entrada del servicio: con
recuperación y fuera de contexto (``meta_sin_recuperacion``). Sin eco del valor recibido, validado contra el spec y sin
invocar idioma, release, embeddings, búsqueda, reranker, LLM ni NLI.
"""

import logging

import pytest

from tests.support.contract import assert_matches_spec
from tests.support.seguimiento import (
    Q_OTRA_PERSONA,
    Q_SEGUIMIENTO,
    crear_entorno_de_seguimiento,
    solicitud_de_seguimiento,
)

RESPUESTA_422 = "#/paths/~1rag~1follow-up/post/responses/422"
TEXTO_LIBRE = "Estado menopáusico de la paciente"


@pytest.mark.parametrize(
    "pregunta", [Q_SEGUIMIENTO, Q_OTRA_PERSONA], ids=["con_recuperacion", "fuera_de_contexto"]
)
@pytest.mark.ac("US-116", 3)
def test_rag_follow_up_faltante_en_texto_libre_responde_422_sin_eco_ni_puertos_invocados(
    pregunta, caplog
):
    caplog.set_level(logging.DEBUG)
    entorno = crear_entorno_de_seguimiento("SEG-OK")
    solicitud = solicitud_de_seguimiento(pregunta)
    solicitud["clinicalContext"]["missingCriticalData"] = ["ki67", TEXTO_LIBRE]

    respuesta = entorno.seguir(solicitud)

    assert respuesta.status_code == 422
    cuerpo = respuesta.json()
    assert_matches_spec(RESPUESTA_422, cuerpo)
    assert cuerpo["error"] == "CUERPO_INVALIDO"
    assert cuerpo["detail"][0]["loc"] == ["body", "clinicalContext", "missingCriticalData", 1]
    assert TEXTO_LIBRE not in respuesta.text
    assert TEXTO_LIBRE not in caplog.text
    assert all(n == 0 for n in entorno.llamadas_a_adapters().values())
    assert entorno.base.detector_idioma.invocaciones == 0
    assert entorno.base.lector_release.invocaciones == 0
