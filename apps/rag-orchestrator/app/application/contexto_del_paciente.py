"""Traduce el ``clinicalContext`` (ya desidentificado) a lo que lee la aplicabilidad: copias literales (ADR-34 b)."""

from app.domain.aplicabilidad_tipos import (
    AtributoDelPaciente,
    BiomarcadorDelPaciente,
    ContextoDelPaciente,
    TratamientoPrevioDelPaciente,
)
from app.schemas.generated.models import ClinicalContext


def contexto_del_paciente(contexto: ClinicalContext) -> ContextoDelPaciente:
    diagnostico = contexto.diagnosis
    if diagnostico is None:
        return _sin_diagnostico(contexto)
    return ContextoDelPaciente(
        biomarcadores=_biomarcadores(contexto),
        valor_de_estadio=diagnostico.stageValue.root,
        grado=diagnostico.grade.root if diagnostico.grade else None,
        escala_de_desempeno=(
            diagnostico.performanceScale.root if diagnostico.performanceScale else None
        ),
        valor_de_desempeno=diagnostico.performanceValue,
        atributos=_atributos(contexto),
        tratamientos_previos=_tratamientos_previos(contexto),
    )


def _sin_diagnostico(contexto: ClinicalContext) -> ContextoDelPaciente:
    return ContextoDelPaciente(
        biomarcadores=_biomarcadores(contexto),
        atributos=_atributos(contexto),
        tratamientos_previos=_tratamientos_previos(contexto),
    )


def _biomarcadores(contexto: ClinicalContext) -> tuple[BiomarcadorDelPaciente, ...]:
    return tuple(
        BiomarcadorDelPaciente(b.biomarkerName.root, b.value.root, b.monthsAgo)
        for b in contexto.biomarkers
    )


def _atributos(contexto: ClinicalContext) -> tuple[AtributoDelPaciente, ...]:
    return tuple(
        AtributoDelPaciente(a.key.root, a.value.root, a.monthsAgo) for a in contexto.attributes
    )


def _tratamientos_previos(contexto: ClinicalContext) -> tuple[TratamientoPrevioDelPaciente, ...]:
    return tuple(
        TratamientoPrevioDelPaciente(t.lineNumber, t.monthsSinceStart)
        for t in contexto.priorTreatments
    )
