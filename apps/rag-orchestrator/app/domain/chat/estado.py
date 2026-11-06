"""Estado efímero de un hilo del chat (ADR-51, US-259): datos puros, sin E/S.

El estado solo contiene lo que ya viaja enmascarado por el contrato (turnos previos y estado estructurado): nunca el
``patientId`` ni el ``pseudoPatientId`` (RN-10, RN-11), que no tienen campo aquí. Es inmutable: cada turno produce un
estado nuevo.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum

MAX_TURNOS_EN_MEMORIA = 50
"""Tope de turnos que un hilo conserva (el de ``ChatRehydration.turns`` del contrato): acota la memoria del proceso."""


class Intencion(StrEnum):
    caso = "caso"
    faltantes = "faltantes"
    evidencia = "evidencia"
    fuentes_limitaciones = "fuentes_limitaciones"
    no_clasificada = "no_clasificada"
    fuera_de_alcance = "fuera_de_alcance"


INTENCIONES_CLASIFICABLES = (
    Intencion.caso,
    Intencion.faltantes,
    Intencion.evidencia,
    Intencion.fuentes_limitaciones,
)
"""Las intenciones que enrutan a un nodo de capacidad; las otras dos son mensajes del sistema."""


@dataclass(frozen=True)
class TurnoPrevio:
    """Un turno ya respondido, tal como Backend 1 lo guarda y lo reenvía al rehidratar (sin ids, fechas ni enlaces)."""

    pregunta: str
    intencion: str
    textos_de_bloques: tuple[str, ...] = ()
    fact_refs: tuple[str, ...] = ()


@dataclass(frozen=True)
class UltimaEvidencia:
    query: str
    chunk_ids: tuple[str, ...]
    top_relevance_score: float | None
    """``None`` ≠ ``0.0``: sin evidencia sobre el umbral no hay puntaje (RN-02)."""


@dataclass(frozen=True)
class EstadoEstructurado:
    intents_vistos: tuple[str, ...] = ()
    preguntas_previas: tuple[str, ...] = ()
    opciones_mostradas: tuple[str, ...] = ()
    citas_mostradas: tuple[str, ...] = ()
    faltantes_senalados: tuple[str, ...] = ()
    ultima_evidencia: UltimaEvidencia | None = None


@dataclass(frozen=True)
class EstadoDelHilo:
    turnos: tuple[TurnoPrevio, ...] = ()
    estructurado: EstadoEstructurado = field(default_factory=EstadoEstructurado)


def estado_tras_el_turno(estado: EstadoDelHilo, turno: TurnoPrevio) -> EstadoDelHilo:
    """El estado con el turno añadido: su intención y su pregunta pasan al estado estructurado y los turnos se acotan."""
    raise NotImplementedError("no implementado")
