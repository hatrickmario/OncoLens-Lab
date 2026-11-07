"""Estado efímero de un hilo del chat (ADR-51, US-259): datos puros, sin E/S.

El estado solo contiene lo que ya viaja enmascarado por el contrato (turnos previos y estado estructurado): nunca el
``patientId`` ni el ``pseudoPatientId`` (RN-10, RN-11), que no tienen campo aquí. Es inmutable: cada turno produce un
estado nuevo.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum

MAX_TURNOS_EN_MEMORIA = 50
"""Tope de turnos que un hilo conserva: lo fija el contrato (``ChatRehydration.turns`` ``maxItems: 50``), que es su dueño;
Backend 1 lo consume de ahí. Un test compara ambos. Acota la memoria del proceso."""

ENTRADAS_DEL_TURNO_VACIAS: dict[str, object] = {
    "pregunta": "",
    "hechos": (),
    "propuestas": (),
    "hay_analisis_activo": False,
    "bloques_del_nodo": (),
    "completitud": (),
    "bloques_deterministas": (),
    "omitidas_del_nodo": 0,
    "limitacion_del_nodo": "",
    "avisos_del_nodo": (),
    "ultima_evidencia": None,
    "opciones_mostradas": (),
    "evidencia_consultada": False,
}
"""Lo que un turno deja en el estado del grafo y que no debe sobrevivirle: se vacía al cerrar y si el turno falla."""


class Intencion(StrEnum):
    caso = "caso"
    faltantes = "faltantes"
    evidencia = "evidencia"
    fuentes_limitaciones = "fuentes_limitaciones"
    no_clasificada = "no_clasificada"
    fuera_de_alcance = "fuera_de_alcance"


class Subintencion(StrEnum):
    """Refinamiento de la intención ``evidencia``: la pregunta se refiere al resultado de un análisis ya registrado."""

    seguimiento_evidencia = "seguimiento_evidencia"


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


def estado_tras_el_turno(
    estado: EstadoDelHilo,
    turno: TurnoPrevio,
    *,
    ultima_evidencia: UltimaEvidencia | None = None,
    opciones_mostradas: tuple[str, ...] = (),
    citas_mostradas: tuple[str, ...] = (),
) -> EstadoDelHilo:
    """El estado con el turno añadido: su intención y su pregunta pasan al estado estructurado y los turnos se acotan.

    Un turno que recupera evidencia sobrescribe ``ultima_evidencia`` y suma sus opciones y citas mostradas (sin repetir);
    uno que no recupera conserva lo anterior."""
    anterior = estado.estructurado
    vistos = anterior.intents_vistos
    estructurado = EstadoEstructurado(
        intents_vistos=vistos if turno.intencion in vistos else (*vistos, turno.intencion),
        preguntas_previas=(*anterior.preguntas_previas, turno.pregunta),
        opciones_mostradas=_sin_repetir(anterior.opciones_mostradas, opciones_mostradas),
        citas_mostradas=_sin_repetir(anterior.citas_mostradas, citas_mostradas),
        faltantes_senalados=anterior.faltantes_senalados,
        ultima_evidencia=ultima_evidencia or anterior.ultima_evidencia,
    )
    return EstadoDelHilo(
        turnos=(*estado.turnos, turno)[-MAX_TURNOS_EN_MEMORIA:], estructurado=estructurado
    )


def _sin_repetir(previos: tuple[str, ...], nuevos: tuple[str, ...]) -> tuple[str, ...]:
    return (*previos, *(n for n in dict.fromkeys(nuevos) if n not in previos))
