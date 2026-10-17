"""Resumen del contexto clínico desidentificado que se embebe junto con la pregunta (US-055).

Solo campos clínicos ya enmascarados por `clinical-api` (RN-11). Nunca el `pseudoPatientId` ni notas libres, eventos o
análisis previos: el texto va a un modelo de *embeddings* y no debe poder reidentificar ni arrastrar instrucciones.
"""

from __future__ import annotations

from app.schemas.generated.models import ClinicalContext


def resumen_del_contexto_clinico(contexto: ClinicalContext) -> str:
    partes: list[str] = []
    diagnostico = contexto.diagnosis
    if diagnostico is not None:
        partes += [
            diagnostico.cancerType.root,
            diagnostico.histology.root if diagnostico.histology else "",
            diagnostico.grade.root if diagnostico.grade else "",
            f"{diagnostico.stagingSystem.root} {diagnostico.stageValue.root}",
        ]
    partes += [f"{b.biomarkerName.root} {b.value.root}" for b in contexto.biomarkers]
    return "; ".join(parte.strip() for parte in partes if parte and parte.strip())
