"""Resumen del contexto clínico desidentificado que se embebe junto con la pregunta (US-055).

Solo campos clínicos ya enmascarados por `clinical-api` (RN-11). Nunca el `pseudoPatientId` ni notas libres, eventos o
análisis previos: el texto va a un modelo de *embeddings* y no debe poder reidentificar ni arrastrar instrucciones.
"""

from __future__ import annotations

from app.prompts.rag_query import datos_del_contexto
from app.schemas.generated.models import ClinicalContext


def resumen_del_contexto_clinico(contexto: ClinicalContext) -> str:
    return "; ".join(texto for texto, _ in datos_del_contexto(contexto))
