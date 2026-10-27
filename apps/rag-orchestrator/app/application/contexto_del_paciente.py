"""Traduce el ``clinicalContext`` (ya desidentificado) a lo que lee la aplicabilidad: copias literales (ADR-34 b)."""

from dataclasses import replace

from app.domain.aplicabilidad_tipos import (
    AtributoDelPaciente,
    BiomarcadorDelPaciente,
    ContextoDelPaciente,
    ProcedenciaDelDato,
    TratamientoPrevioDelPaciente,
)
from app.schemas.generated.models import ClinicalContext, Provenance, ReviewStatus


def contexto_del_paciente(contexto: ClinicalContext) -> ContextoDelPaciente:
    del_paciente = ContextoDelPaciente(
        biomarcadores=_biomarcadores(contexto),
        atributos=_atributos(contexto),
        tratamientos_previos=_tratamientos_previos(contexto),
        datos_criticos_faltantes=frozenset(d.root for d in contexto.missingCriticalData),
    )
    diagnostico = contexto.diagnosis
    if diagnostico is None:
        return del_paciente
    return replace(
        del_paciente,
        valor_de_estadio=diagnostico.stageValue.root,
        grado=diagnostico.grade.root if diagnostico.grade else None,
        escala_de_desempeno=(
            diagnostico.performanceScale.root if diagnostico.performanceScale else None
        ),
        valor_de_desempeno=diagnostico.performanceValue,
        procedencia_del_diagnostico=_procedencia(diagnostico.provenance),
    )


def _procedencia(procedencia: Provenance) -> ProcedenciaDelDato:
    """Lo que el aviso necesita de la ``provenance`` (RN-07): el mismo criterio que ``etiqueta_de_procedencia``."""
    return ProcedenciaDelDato(
        requiere_revision=procedencia.reviewStatus == ReviewStatus.requiere_revision,
        en_conflicto=procedencia.conflict,
    )


def _biomarcadores(contexto: ClinicalContext) -> tuple[BiomarcadorDelPaciente, ...]:
    return tuple(
        BiomarcadorDelPaciente(
            b.biomarkerName.root, b.value.root, b.monthsAgo, _procedencia(b.provenance)
        )
        for b in contexto.biomarkers
    )


def _atributos(contexto: ClinicalContext) -> tuple[AtributoDelPaciente, ...]:
    return tuple(
        AtributoDelPaciente(a.key.root, a.value.root, a.monthsAgo, _procedencia(a.provenance))
        for a in contexto.attributes
    )


def _tratamientos_previos(contexto: ClinicalContext) -> tuple[TratamientoPrevioDelPaciente, ...]:
    return tuple(
        TratamientoPrevioDelPaciente(t.lineNumber, t.monthsSinceStart, _procedencia(t.provenance))
        for t in contexto.priorTreatments
    )
