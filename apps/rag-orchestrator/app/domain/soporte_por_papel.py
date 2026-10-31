"""Regla por papel de las afirmaciones atómicas de una opción (RN-01, US-245): pura, sin E/S.

Una opción nunca se muestra más fuerte que su fuente: la principal y la salvedad sin respaldo descartan la opción; una
secundaria sin respaldo solo se omite. Un modal normativo descarta la opción en cualquier papel (D-a) y el lenguaje de
la lista prohibida (RN-23) la descarta con su propio motivo, que precede a los demás.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from enum import StrEnum

from app.domain.claims import PapelDeAfirmacion


class EstadoDeAfirmacion(StrEnum):
    soportada = "soportada"
    sin_soporte = "sin_soporte"
    fuera_de_forma = "fuera_de_forma"  # alias de fragmento o más palabras que el máximo: sin soporte, sin consultar al NLI
    modal_normativo = "modal_normativo"
    lenguaje_no_permitido = "lenguaje_no_permitido"


class MotivoDeSoporte(StrEnum):
    afirmacion_sin_soporte = "afirmacion_sin_soporte"
    lenguaje_no_permitido = "lenguaje_no_permitido"


@dataclass(frozen=True)
class DecisionPorPapel:
    conservar: bool
    motivo: MotivoDeSoporte | None
    omitidas: tuple[int, ...]
    """Posiciones de las secundarias que se omiten y se cuentan en ``omittedClaims`` (solo si la opción se conserva)."""


def decidir_opcion_por_papel(
    estados: Sequence[tuple[PapelDeAfirmacion, EstadoDeAfirmacion]],
    option_incumple: bool = False,
) -> DecisionPorPapel:
    """``option_incumple``: el propio texto de la opción incumple la lista prohibida (RN-23)."""
    motivo = motivo_de_descarte(estados, option_incumple)
    if motivo is not None:
        return DecisionPorPapel(False, motivo, ())
    omitidas = tuple(
        posicion
        for posicion, (papel, estado) in enumerate(estados)
        if papel is PapelDeAfirmacion.secundaria and estado is not EstadoDeAfirmacion.soportada
    )
    return DecisionPorPapel(True, None, omitidas)


def motivo_de_descarte(
    estados: Sequence[tuple[PapelDeAfirmacion, EstadoDeAfirmacion]], option_incumple: bool
) -> MotivoDeSoporte | None:
    """Precedencia: ``lenguaje_no_permitido`` (reservado a la lista prohibida) → modal normativo → papel sin respaldo."""
    estados_presentes = {estado for _, estado in estados}
    if option_incumple or EstadoDeAfirmacion.lenguaje_no_permitido in estados_presentes:
        return MotivoDeSoporte.lenguaje_no_permitido
    if EstadoDeAfirmacion.modal_normativo in estados_presentes or any(
        papel is not PapelDeAfirmacion.secundaria and estado is not EstadoDeAfirmacion.soportada
        for papel, estado in estados
    ):
        return MotivoDeSoporte.afirmacion_sin_soporte
    return None


def es_causa_de_descarte(papel: PapelDeAfirmacion, estado: EstadoDeAfirmacion) -> bool:
    raise NotImplementedError("no implementado")
