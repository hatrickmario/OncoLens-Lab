"""`POST /rag/query`, metadatos factuales de la fuente copiados del catálogo (US-127 / L1D-182): RN-25, RN-04, AC-08.9.

Corpus FX-08b-a (``doc-a1`` con fase, endpoint y tamaño; ``doc-a3`` sin endpoint ni tamaño), catálogo, reranker, NLI y
Milvus falsos. El LLM del AC-2 es el cliente falso de FX-06a-b con el ``LlmEvidenceGenerator`` real: el parseo es el de
producción. Cada respuesta la valida contra el spec del proveedor el hook de ``verificacion_proveedor.py``.
"""

import json
from typing import Any

import pytest

from app.application.generation import LlmEvidenceGenerator
from tests.support.aplicabilidad import (
    FICHAS_FX08BA,
    POBLACIONES_FX08BA,
    GeneradorDeAplicabilidad,
    entorno_de_aplicabilidad,
    external_id_de,
    solicitud_a_m1,
)
from tests.support.llm_falso import FakeLlmClient

RELEVANCIA_ALTA = 0.90
METADATOS = (
    "studyDesign",
    "trialPhase",
    "primaryEndpoint",
    "sampleSize",
    "publishedAt",
    "lastUpdatedAt",
    "guidelineVersion",
)


def _consultar(documento: str, generador: Any = None) -> dict[str, Any]:
    entorno = entorno_de_aplicabilidad({documento: RELEVANCIA_ALTA}, generador=generador)
    respuesta = entorno.consultar(solicitud_a_m1())
    assert respuesta.status_code == 200
    return respuesta.json()


def _cita_de(cuerpo: dict[str, Any]) -> dict[str, Any]:
    citas = cuerpo["evidenceOptions"][0]["citedSources"]
    assert len(citas) == 1
    return citas[0]


def _columnas_de(documento: str) -> dict[str, Any]:
    ficha = FICHAS_FX08BA[documento]
    return {
        "studyDesign": ficha.study_design,
        "trialPhase": ficha.trial_phase,
        "primaryEndpoint": ficha.primary_endpoint,
        "sampleSize": ficha.sample_size,
        "publishedAt": ficha.published_at.isoformat() if ficha.published_at else None,
        "lastUpdatedAt": ficha.last_updated_at.isoformat() if ficha.last_updated_at else None,
        "guidelineVersion": ficha.guideline_version,
    }


@pytest.mark.ac("US-127", 1)
def test_rag_query_trae_los_siete_metadatos_iguales_a_las_columnas_cuando_la_opcion_cita_doc_a1():
    cuerpo = _consultar("doc-a1")

    cita = _cita_de(cuerpo)
    assert cita["externalId"] == external_id_de("doc-a1")
    assert {campo: cita[campo] for campo in METADATOS} == _columnas_de("doc-a1")
    assert None not in (cita[campo] for campo in METADATOS)  # el fixture los trae todos


@pytest.mark.ac("US-127", 2)
def test_rag_query_conserva_sample_size_y_trial_phase_del_catalogo_cuando_el_llm_los_inventa_en_la_opcion():
    llm = FakeLlmClient("LLM-METADATOS-FALSOS")

    cuerpo = _consultar("doc-a1", generador=LlmEvidenceGenerator(llm))

    assert llm.invocaciones == 1
    cita = _cita_de(cuerpo)
    assert (cita["sampleSize"], cita["trialPhase"]) == (4800, "III")
    serializado = json.dumps(cuerpo, ensure_ascii=False)
    assert "9999" not in serializado
    assert '"IV"' not in serializado


@pytest.mark.ac("US-127", 3)
def test_rag_query_devuelve_endpoint_y_tamano_en_null_cuando_doc_a3_no_los_registra():
    cuerpo = _consultar("doc-a3", generador=GeneradorDeAplicabilidad(documento="doc-a3"))

    cita = _cita_de(cuerpo)
    assert cita["externalId"] == external_id_de("doc-a3")
    assert "primaryEndpoint" in cita
    assert "sampleSize" in cita
    assert cita["primaryEndpoint"] is None
    assert cita["sampleSize"] is None


@pytest.mark.ac("US-127", 4)
def test_rag_query_devuelve_study_population_value_identico_a_population_criteria_cuando_se_cita_doc_a1():
    cuerpo = _consultar("doc-a1")

    fuente = next(
        f for f in cuerpo["applicability"] if f["externalId"] == external_id_de("doc-a1")
    )
    valores = {c["criterion"]: c["studyPopulationValue"] for c in fuente["criteria"]}
    criterios = POBLACIONES_FX08BA["doc-a1"].criterios
    assert valores["estadio"] == criterios["estadio"] == "I–III"  # raya (U+2013) intacta
    assert valores["ecog"] == criterios["ecog"]
    assert valores["estado_her2"] == criterios["biomarcadores"]["her2"]  # type: ignore[index]
    patient_values = {c["patientValue"] for c in fuente["criteria"]} - {None}
    assert patient_values.isdisjoint({v for v in valores.values() if v is not None})
