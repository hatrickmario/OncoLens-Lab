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

from app.schemas.generated.models import RagQueryInternalRequest, RagQueryInternalResponse


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
