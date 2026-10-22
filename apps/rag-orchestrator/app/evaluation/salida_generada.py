"""Los textos GENERADOS de una propuesta cruda o de una respuesta, rotulados por campo (``CAMPOS_GENERADOS``).

Solo viven en memoria durante la corrida: lo que llega al reporte son conteos (RN-14).
"""

from __future__ import annotations

from app.application.ports import EvidenciaGenerada
from app.domain.support import CampoGenerado
from app.evaluation.metricas.prescriptivas import TextoGenerado
from app.schemas.generated.models import EvidenceOption, RagQueryInternalResponse

CAMPO_LIMITACION: CampoGenerado = "limitations[].text"


def textos_de_propuesta(evidencia: EvidenciaGenerada) -> list[TextoGenerado]:
    textos: list[TextoGenerado] = []
    for opcion in evidencia.opciones:
        textos.append(("option", opcion.option))
        textos.append(("rationale", opcion.rationale))
        textos.extend(("details", detalle) for detalle in opcion.details)
    textos.extend(
        (CAMPO_LIMITACION, limitacion) for limitacion in evidencia.limitaciones_propuestas
    )
    return textos


def textos_de_opcion_mostrada(opcion: EvidenceOption) -> list[TextoGenerado]:
    return [
        ("option", opcion.option),
        ("rationale", opcion.rationale),
        *(("details", detalle.root) for detalle in opcion.details or []),
    ]


def textos_de_respuesta(respuesta: RagQueryInternalResponse) -> list[TextoGenerado]:
    """Todo lo generado que la respuesta muestra, incluidas las opciones descartadas y la síntesis."""
    textos: list[TextoGenerado] = []
    for opcion in respuesta.evidenceOptions:
        textos.extend(textos_de_opcion_mostrada(opcion))
    for descartada in respuesta.discardedOptions:
        textos.append(("option", descartada.option))
        textos.append(("rationale", descartada.rationale))
        textos.extend(
            ("unsupportedClaims", afirmacion) for afirmacion in descartada.unsupportedClaims
        )
    textos.extend((CAMPO_LIMITACION, limitacion.text) for limitacion in respuesta.limitations)
    textos.extend(("synthesis", acuerdo.root.text) for acuerdo in respuesta.synthesis.agreements)
    for discrepancia in respuesta.synthesis.discrepancies:
        textos.append(("synthesis", discrepancia.claim.root.text))
        if discrepancia.explanation:
            textos.append(("synthesis", discrepancia.explanation))
    return textos
