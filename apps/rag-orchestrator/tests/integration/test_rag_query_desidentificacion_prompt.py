"""Regresión de RN-11 en la generación de `/rag/query` (L1D-203, tarea 3.1): el seudónimo nunca llega al LLM."""

import pytest

from app.application.generation import LlmEvidenceGenerator
from app.domain.alias_de_chunks import asignar_alias
from app.domain.relevance import ChunkPuntuado
from app.prompts.rag_query import bloque_de_datos_del_paciente, construir_prompt_rag_query
from app.schemas.generated.models import RagQueryInternalRequest
from tests.support.llm_falso import FakeLlmClient
from tests.support.recuperacion import Q_HER2, crear_entorno, solicitud_de

PSEUDONIMO = "psd_p7f3a"
FRAGMENTO_DEL_SEUDONIMO = "p7f3a"


def _solicitud_sintetica() -> dict:
    solicitud = solicitud_de(Q_HER2, max_options=1)
    solicitud["clinicalContext"]["pseudoPatientId"] = PSEUDONIMO
    return solicitud


@pytest.mark.ac("US-049", 5)
def test_prompt_rag_query_con_pseudo_patient_id_no_lo_incluye():
    solicitud = _solicitud_sintetica()
    modelo = RagQueryInternalRequest.model_validate(solicitud)
    assert modelo.clinicalContext.pseudoPatientId == PSEUDONIMO
    fragmentos = [ChunkPuntuado("ch-1", "doc-1", "texto del fragmento", 0.9)]
    prompt_directo = construir_prompt_rag_query(
        modelo.query,
        bloque_de_datos_del_paciente(modelo.clinicalContext),
        asignar_alias(fragmentos).fragmentos,
        "es",
    )
    llm = FakeLlmClient("LLM-OK")

    respuesta = crear_entorno(generador=LlmEvidenceGenerator(llm)).consultar(solicitud)

    assert respuesta.status_code == 200
    assert llm.invocaciones == 1
    for prompt in [prompt_directo, *llm.prompts]:
        assert PSEUDONIMO not in prompt
        assert FRAGMENTO_DEL_SEUDONIMO not in prompt
