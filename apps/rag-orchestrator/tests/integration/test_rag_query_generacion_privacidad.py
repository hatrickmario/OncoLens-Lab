"""No-fuga de la generación de `/rag/query` (L1D-275, tarea 2.10): RN-10, RN-11.

El prompt no lleva el seudónimo del paciente y los logs no llevan prompt, pregunta, contexto, texto generado ni chunks.
"""

import logging

import pytest

from tests.support.generador_llm import generador_con_llm
from app.application.ports import FalloDelLlm
from tests.support.generador_falso import OPCION_ANTI_HER2, RAZON_ANTI_HER2
from tests.support.llm_falso import FakeLlmClient
from tests.support.recuperacion import CORPUS_FX06A, Q_HER2, crear_entorno, solicitud_de

SENTINELA_HISTOLOGIA = "SENTINELA-HISTOLOGIA-9X"
SENTINELA_FALLO_LLM = "SENTINELA-HOST-LLM-interno.test:11434"


def _solicitud_con_pii_sembrada() -> dict:
    """FX-T4a-a (sintética): texto libre del contexto con un centinela y el seudónimo de la consulta."""
    solicitud = solicitud_de(Q_HER2, max_options=1)
    solicitud["clinicalContext"]["diagnosis"]["histology"] = SENTINELA_HISTOLOGIA
    return solicitud


def test_prompt_no_contiene_el_pseudo_patient_id_cuando_el_contexto_trae_pii_sembrada():
    llm = FakeLlmClient("LLM-OK")
    solicitud = _solicitud_con_pii_sembrada()

    respuesta = crear_entorno(generador=generador_con_llm(llm)).consultar(solicitud)

    assert respuesta.status_code == 200
    assert llm.invocaciones == 1
    assert solicitud["clinicalContext"]["pseudoPatientId"] not in llm.prompts[0]


@pytest.mark.parametrize(
    "escenario", ["LLM-OK", "LLM-FUERA-DE-ESQUEMA", "LLM-JSON-ROTO", "LLM-CAIDO"]
)
def test_logs_no_contienen_prompt_pregunta_contexto_ni_texto_generado_cuando_se_genera(
    escenario, caplog
):
    llm = (
        FakeLlmClient("LLM-OK", error=FalloDelLlm(SENTINELA_FALLO_LLM))
        if escenario == "LLM-CAIDO"
        else FakeLlmClient(escenario)
    )
    solicitud = _solicitud_con_pii_sembrada()
    caplog.set_level(logging.DEBUG)

    crear_entorno(generador=generador_con_llm(llm)).consultar(solicitud)

    prohibidos = [
        solicitud["query"],
        solicitud["clinicalContext"]["pseudoPatientId"],
        SENTINELA_HISTOLOGIA,
        SENTINELA_FALLO_LLM,
        OPCION_ANTI_HER2,
        RAZON_ANTI_HER2,
        *llm.prompts,
        *(chunk.texto for chunk in CORPUS_FX06A),
    ]
    formateador = logging.Formatter()
    for registro in caplog.records:
        texto = registro.getMessage()
        if registro.exc_info:
            texto += formateador.formatException(registro.exc_info)
        for prohibido in prohibidos:
            assert prohibido not in texto
