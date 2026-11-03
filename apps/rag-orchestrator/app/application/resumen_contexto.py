"""Resumen del contexto clínico desidentificado que se embebe junto con la pregunta (US-055, US-116).

Solo campos clínicos ya enmascarados por `clinical-api` (RN-11). Nunca el `pseudoPatientId` ni notas libres, eventos o
análisis previos: el texto va a un modelo de *embeddings* y no debe poder reidentificar ni arrastrar instrucciones.
"""

from __future__ import annotations

from app.prompts.rag_query import datos_del_contexto
from app.schemas.generated.models import ClinicalContext

# Etiqueta de la línea de tratamiento actual (P-1, Decidido (usuario, 2026-11-03)): el catálogo no tiene etiqueta para
# ``currentLine``; el literal se versiona con este resumen y la suite ``evaluate`` mide su efecto en el recall dense.
ETIQUETA_DE_LA_LINEA_ACTUAL = "línea de tratamiento"


def resumen_del_contexto_clinico(contexto: ClinicalContext) -> str:
    """Diagnóstico, biomarcadores y, si se conoce, la línea actual; nunca un dato crítico faltante (IA-03).

    Embeber «Ki-67 desconocido» acercaría chunks sobre Ki-67 sin dato del paciente: los faltantes no entran."""
    partes = [texto for texto, _ in datos_del_contexto(contexto)]
    if contexto.currentLine is not None:
        partes.append(f"{ETIQUETA_DE_LA_LINEA_ACTUAL} {contexto.currentLine}")
    return "; ".join(partes)
