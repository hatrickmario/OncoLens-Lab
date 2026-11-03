"""`POST /rag/query` con faltantes y sin evidencia (US-116 / L1D-113 AC-4): RN-02 enmendada, regresión.

Declarar `missingCriticalData` no altera el corte por umbral: con `Q-SIN` (FX-06a-a, umbral 0,30) la respuesta es
`sin_evidencia` con `topRelevanceScore = null`, el LLM de generación registra cero invocaciones y la reescritura de
US-238 (como mucho una) recibe solo la pregunta, nunca los faltantes. Cada respuesta se valida contra el spec del
proveedor (hook de `verificacion_proveedor.py`, US-214).
"""

import pytest

from tests.support.recuperacion import Q_SIN, crear_entorno, solicitud_de
from tests.support.reescritura import Q_SIN_RESPUESTA, crear_entorno_de_reescritura

FALTANTES = ["estado_menopausico", "ki67"]
ETIQUETAS_Y_CLAVES = ("Estado menopáusico", "Ki-67", "estado_menopausico", "ki67", "desconocido")


def _con_faltantes(pregunta: str) -> dict:
    solicitud = solicitud_de(pregunta)
    solicitud["clinicalContext"]["missingCriticalData"] = FALTANTES
    return solicitud


def _exigir_sin_evidencia(respuesta) -> None:
    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert cuerpo["status"] == "sin_evidencia"
    assert cuerpo["evidenceOptions"] == []
    assert cuerpo["topRelevanceScore"] is None


@pytest.mark.ac("US-116", 4)
def test_rag_query_responde_sin_evidencia_sin_invocar_la_generacion_cuando_hay_faltantes_y_q_sin():
    entorno = crear_entorno()

    respuesta = entorno.consultar(_con_faltantes(Q_SIN))

    _exigir_sin_evidencia(respuesta)
    assert entorno.generador.invocaciones == 0


@pytest.mark.ac("US-116", 4)
def test_rag_query_reescribe_a_lo_sumo_una_vez_y_sin_los_faltantes_cuando_hay_faltantes_y_no_hay_evidencia():
    entorno, reescritor, _ = crear_entorno_de_reescritura()

    respuesta = entorno.consultar(_con_faltantes(Q_SIN_RESPUESTA))

    _exigir_sin_evidencia(respuesta)
    assert entorno.generador.invocaciones == 0
    assert reescritor.invocaciones == 1
    assert reescritor.preguntas == [Q_SIN_RESPUESTA]
    for ajeno in ETIQUETAS_Y_CLAVES:
        assert not any(ajeno in pregunta for pregunta in reescritor.preguntas)
