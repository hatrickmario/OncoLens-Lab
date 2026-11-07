"""El contexto de la consulta de relevancia es una lista blanca: del caso solo entra el tipo de cáncer (RN-11, US-264)."""

import json

from app.application.chat.contexto_del_turno import contexto_solo_con_el_tipo_de_cancer
from app.schemas.generated.models import ClinicalContext
from tests.support.recuperacion import EJEMPLOS

PERMITIDOS = {"pseudoPatientId", "population", "diagnosis"}
"""Campos que pueden llevar algo: el seudónimo y la población son neutros y el diagnóstico solo trae el tipo de cáncer."""
PROVENANCE = {
    "entryMethod": "manual",
    "extractionConfidence": "alta",
    "reviewStatus": "verificado",
    "conflict": False,
}


def contexto_con_todos_los_campos_poblados() -> ClinicalContext:
    cuerpo = json.loads((EJEMPLOS / "chat-turn-request.json").read_text(encoding="utf-8"))[
        "clinicalContext"
    ]
    cuerpo["clinicalNotes"] = [
        {
            "dataRef": "r20",
            "noteType": "nota_libre",
            "content": "SENTINELA-NOTA",
            "monthsAgo": 1,
            "provenance": PROVENANCE,
        }
    ]
    cuerpo["currentLine"] = 2
    cuerpo["attributes"] = [
        {
            "dataRef": "r21",
            "key": "estado_menopausico",
            "value": "SENTINELA-ATRIBUTO",
            "monthsAgo": 1,
            "provenance": PROVENANCE,
        }
    ]
    cuerpo["priorTreatments"] = [
        {
            "dataRef": "r22",
            "lineNumber": 1,
            "setting": "adyuvante",
            "regimenName": "SENTINELA-REGIMEN",
            "atcCodes": [],
            "monthsSinceStart": 3,
            "monthsSinceEnd": 1,
            "endReason": "completado",
            "provenance": PROVENANCE,
        }
    ]
    cuerpo["missingCriticalData"] = ["ki67"]
    cuerpo["biomarkerTrends"] = [
        {"dataRef": "r23", "biomarkerName": "SENTINELA-TENDENCIA", "trend": "sube", "points": 2}
    ]
    cuerpo["priorAnalyses"] = [
        {
            "source": "analisis_previo_ia",
            "citable": False,
            "monthsAgo": 1,
            "question": "SENTINELA-PREGUNTA",
            "synthesisSummary": "SENTINELA-SINTESIS",
            "optionsDescribed": ["SENTINELA-OPCION"],
            "linkedDecision": None,
            "outcomesSince": [],
        }
    ]
    return ClinicalContext.model_validate(cuerpo)


def test_el_contexto_deja_vacio_todo_campo_que_no_es_de_la_lista_blanca_cuando_el_caso_trae_todos_poblados():
    origen = contexto_con_todos_los_campos_poblados()
    for campo in ClinicalContext.model_fields:
        assert getattr(origen, campo), f"el fixture debe poblar {campo}"

    contexto = contexto_solo_con_el_tipo_de_cancer(origen.diagnosis.cancerType)  # type: ignore[union-attr]

    for campo in set(ClinicalContext.model_fields) - PERMITIDOS:
        assert not getattr(contexto, campo), f"{campo} no debe llevar datos del paciente"
    assert contexto.pseudoPatientId != origen.pseudoPatientId
    assert "SENTINELA" not in contexto.model_dump_json()


def test_el_diagnostico_solo_lleva_el_tipo_de_cancer_cuando_se_construye_desde_el_caso():
    origen = contexto_con_todos_los_campos_poblados()

    diagnostico = contexto_solo_con_el_tipo_de_cancer(origen.diagnosis.cancerType).diagnosis  # type: ignore[union-attr]

    assert diagnostico is not None and diagnostico.cancerType.root == "mama"
    assert (diagnostico.histology, diagnostico.grade) == (None, None)
    assert diagnostico.stagingSystem.root == diagnostico.stageValue.root == ""
    assert diagnostico.performanceValue is None and diagnostico.monthsSinceDiagnosis == 0


def test_el_contexto_no_trae_diagnostico_cuando_el_caso_no_lo_tiene():
    assert contexto_solo_con_el_tipo_de_cancer(None).diagnosis is None
