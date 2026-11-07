"""Lo que un turno entrega a los nodos de evidencia sin pasar por el estado del grafo (L1D-322, ADR-51).

El estado del grafo se guarda en el punto de control del hilo; la petición interna de ``/rag/query`` lleva el
``clinicalContext`` (con el ``pseudoPatientId`` del turno) y el resultado del análisis lleva texto del corpus: ninguno
debe sobrevivir al turno ni llegar al checkpoint (RN-10, RN-11). Por eso viajan en un ``ContextVar`` de la petición
(como la clasificación de datos de RN-12): se fija al entrar al turno y se descarta al salir.
"""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass

from app.schemas.generated.models import (
    ClinicalContext,
    DataRef,
    Diagnosis,
    EntryMethod,
    ExtractionConfidence,
    Population,
    Provenance,
    RagQueryInternalRequest,
    RagQueryInternalResponse,
    ReviewStatus,
    TextoEnmascarado,
)

PSEUDONIMO_SIN_PACIENTE = "psd_sinpaciente"
"""Seudónimo neutro del contexto sin paciente: el esquema lo exige, pero ningún texto de búsqueda lo lleva (RN-11)."""


@dataclass
class EvidenciaDelTurno:
    """La petición interna equivalente del turno y, si el turno fue de análisis, su resultado completo."""

    consulta: RagQueryInternalRequest
    resultado: RagQueryInternalResponse | None = None


_evidencia_del_turno: ContextVar[EvidenciaDelTurno | None] = ContextVar(
    "evidencia_del_turno", default=None
)


@contextmanager
def con_evidencia_del_turno(consulta: RagQueryInternalRequest) -> Iterator[EvidenciaDelTurno]:
    """Fija la petición interna del turno para los nodos que corran dentro del bloque."""
    evidencia = EvidenciaDelTurno(consulta)
    marca = _evidencia_del_turno.set(evidencia)
    try:
        yield evidencia
    finally:
        _evidencia_del_turno.reset(marca)


def evidencia_del_turno() -> EvidenciaDelTurno:
    """La evidencia del turno en curso; fuera de un turno es un error de programación."""
    evidencia = _evidencia_del_turno.get()
    if evidencia is None:
        raise RuntimeError("el nodo de evidencia corrió fuera de un turno del chat")
    return evidencia


def contexto_solo_con_el_tipo_de_cancer(tipo_de_cancer: TextoEnmascarado | None) -> ClinicalContext:
    """Un contexto clínico construido desde cero (lista blanca): del caso solo entra el tipo de cáncer del diagnóstico; todo lo
    demás es vacío o neutro. Un campo nuevo de ``ClinicalContext`` nace vacío aquí, nunca copia datos del paciente (RN-11):
    el resumen del contexto se embebe y puntúa junto con la consulta."""
    vacio = TextoEnmascarado(root="")
    diagnostico = (
        None
        if tipo_de_cancer is None
        else Diagnosis(
            dataRef=DataRef(root="r0"),
            cancerType=tipo_de_cancer,
            histology=None,
            grade=None,
            stagingSystem=vacio,
            stageValue=vacio,
            performanceScale=None,
            performanceValue=None,
            monthsSinceDiagnosis=0,
            provenance=Provenance(
                entryMethod=EntryMethod.seed,
                extractionConfidence=ExtractionConfidence.n_a,
                reviewStatus=ReviewStatus.verificado,
                conflict=False,
            ),
        )
    )
    return ClinicalContext(
        pseudoPatientId=PSEUDONIMO_SIN_PACIENTE,
        population=Population.adulto,
        diagnosis=diagnostico,
        biomarkers=[],
        clinicalNotes=[],
        currentLine=None,
        attributes=[],
        priorTreatments=[],
        events=[],
        biomarkerTrends=[],
        missingCriticalData=[],
        priorAnalyses=[],
    )
