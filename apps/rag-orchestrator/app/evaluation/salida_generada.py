"""Los textos GENERADOS de una propuesta cruda o de una respuesta, rotulados por campo (``CAMPOS_GENERADOS``).

Solo viven en memoria durante la corrida: lo que llega al reporte son conteos (RN-14).
"""

from __future__ import annotations

from dataclasses import dataclass

from app.application.ports import EvidenciaGenerada
from app.domain.lenguaje import FuenteCitada
from app.domain.support import CampoGenerado, FuentesDeLaConsulta, campo_de_papel
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


@dataclass(frozen=True)
class GrupoDeTextos:
    """Textos generados que comparten las fuentes con las que el filtro reconoce una cita atribuida (RN-23, US-249)."""

    textos: list[TextoGenerado]
    fuentes: tuple[FuenteCitada, ...]


def grupos_de_propuesta(
    evidencia: EvidenciaGenerada, consulta: FuentesDeLaConsulta
) -> list[GrupoDeTextos]:
    """Lo que el filtro de producción ve de la propuesta cruda: el título y cada afirmación atómica con los fragmentos que
    cita SU opción (``rationale`` la principal, ``details`` el resto) y las limitaciones con todos los entregados."""
    grupos = [
        GrupoDeTextos(
            [
                ("option", opcion.option),
                *((campo_de_papel(a.papel), a.texto) for a in opcion.afirmaciones),
            ],
            consulta.citadas_por(opcion.chunk_ids_citados),
        )
        for opcion in evidencia.opciones
    ]
    limitaciones = [(CAMPO_LIMITACION, texto) for texto in evidencia.limitaciones_propuestas]
    return [*grupos, GrupoDeTextos(limitaciones, consulta.todas())]


def grupos_de_respuesta(
    respuesta: RagQueryInternalResponse, consulta: FuentesDeLaConsulta
) -> list[GrupoDeTextos]:
    """Lo que la respuesta muestra, con las fuentes que el filtro daría a cada texto: cada opción mostrada con las que cita,
    las limitaciones con todas las entregadas y el resto (descartadas, población, síntesis) con ninguna."""
    por_opcion = [
        GrupoDeTextos(
            textos_de_opcion_mostrada(opcion),
            consulta.citadas_por([f.chunkId for f in opcion.citedSources]),
        )
        for opcion in respuesta.evidenceOptions
    ]
    limitaciones = GrupoDeTextos(
        [(CAMPO_LIMITACION, limitacion.text) for limitacion in respuesta.limitations],
        consulta.todas(),
    )
    return [*por_opcion, limitaciones, GrupoDeTextos(_textos_sin_fuentes(respuesta), ())]


def textos_de_poblacion(respuesta: RagQueryInternalResponse) -> list[TextoGenerado]:
    """Los valores de población del estudio que muestra cada criterio: los extrae el LLM de la ingesta (RN-23, ADR-47)."""
    textos: list[TextoGenerado] = []
    for fuente in respuesta.applicability:
        for criterio in fuente.criteria:
            if criterio.studyPopulationValue is not None:
                textos.append(("studyPopulationValue", criterio.studyPopulationValue))
            textos.extend(
                ("studyPopulationValues[].value", valor.value)
                for valor in criterio.studyPopulationValues or []
            )
    return textos


def _textos_sin_fuentes(respuesta: RagQueryInternalResponse) -> list[TextoGenerado]:
    """Descartadas, valores de población y síntesis: textos generados a los que el filtro no da fuentes citadas."""
    textos: list[TextoGenerado] = []
    for descartada in respuesta.discardedOptions:
        textos.append(("option", descartada.option))
        textos.append(("rationale", descartada.rationale))
        textos.extend(
            ("unsupportedClaims", afirmacion) for afirmacion in descartada.unsupportedClaims
        )
    textos.extend(textos_de_poblacion(respuesta))
    textos.extend(("synthesis", acuerdo.root.text) for acuerdo in respuesta.synthesis.agreements)
    for discrepancia in respuesta.synthesis.discrepancies:
        textos.append(("synthesis", discrepancia.claim.root.text))
        if discrepancia.explanation:
            textos.append(("synthesis", discrepancia.explanation))
    return textos


def textos_de_respuesta(respuesta: RagQueryInternalResponse) -> list[TextoGenerado]:
    """Todo lo generado que la respuesta muestra, incluidas las opciones descartadas y la síntesis."""
    textos: list[TextoGenerado] = []
    for opcion in respuesta.evidenceOptions:
        textos.extend(textos_de_opcion_mostrada(opcion))
    textos.extend((CAMPO_LIMITACION, limitacion.text) for limitacion in respuesta.limitations)
    textos.extend(_textos_sin_fuentes(respuesta))
    return textos
