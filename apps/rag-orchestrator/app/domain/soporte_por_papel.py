"""Regla por papel de las afirmaciones atómicas de una opción (RN-01, US-245): pura, sin E/S.

Una opción nunca se muestra más fuerte que su fuente: la principal y la salvedad sin respaldo descartan la opción; una
secundaria sin respaldo solo se omite. Un modal normativo descarta la opción en cualquier papel (D-a) y el lenguaje de
la lista prohibida (RN-23) la descarta con su propio motivo, que precede a los demás.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from enum import StrEnum

from app.domain.atribucion import FormaDeAfirmacion
from app.domain.claims import PapelDeAfirmacion


class EstadoDeAfirmacion(StrEnum):
    en_forma = "en_forma"  # pasó lenguaje y forma; todavía sin veredicto del NLI: NO es respaldo
    soportada_por_nli = "soportada_por_nli"
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
    posiciones_omitidas: tuple[int, ...]
    """Posiciones de las secundarias que se omiten y se cuentan en ``omittedClaims`` (solo si la opción se conserva)."""


def decidir_opcion_retirada_por_lenguaje() -> DecisionPorPapel:
    """El propio texto de la opción incumple la lista prohibida (RN-23): se descarta sin mirar sus afirmaciones."""
    return DecisionPorPapel(False, MotivoDeSoporte.lenguaje_no_permitido, ())


def decidir_opcion_por_papel(
    estados: Sequence[tuple[PapelDeAfirmacion, EstadoDeAfirmacion]],
) -> DecisionPorPapel:
    """Decide la opción por el estado de cada afirmación atómica: la regla por papel de RN-01."""
    motivo = motivo_de_descarte(estados)
    if motivo is not None:
        return DecisionPorPapel(False, motivo, ())
    omitidas = tuple(
        posicion
        for posicion, (papel, estado) in enumerate(estados)
        if papel is PapelDeAfirmacion.secundaria
        and estado is not EstadoDeAfirmacion.soportada_por_nli
    )
    return DecisionPorPapel(True, None, omitidas)


def motivo_de_descarte(
    estados: Sequence[tuple[PapelDeAfirmacion, EstadoDeAfirmacion]],
) -> MotivoDeSoporte | None:
    """Precedencia: ``lenguaje_no_permitido`` (reservado a la lista prohibida) → modal normativo → papel sin respaldo."""
    if any(e is EstadoDeAfirmacion.lenguaje_no_permitido for _, e in estados):
        return MotivoDeSoporte.lenguaje_no_permitido
    if any(es_causa_de_descarte(papel, estado) for papel, estado in estados):
        return MotivoDeSoporte.afirmacion_sin_soporte
    return None


def estado_por_lenguaje_y_forma(
    reglas: tuple[str, ...], forma: FormaDeAfirmacion
) -> EstadoDeAfirmacion:
    """Orden de validación previo al NLI: lenguaje de la lista → forma. ``en_forma`` NO es respaldo: falta el NLI."""
    if reglas:
        return EstadoDeAfirmacion.lenguaje_no_permitido
    if forma is FormaDeAfirmacion.modal_normativo:
        return EstadoDeAfirmacion.modal_normativo
    if forma is not FormaDeAfirmacion.valida:
        return EstadoDeAfirmacion.fuera_de_forma
    return EstadoDeAfirmacion.en_forma


def es_causa_de_descarte(papel: PapelDeAfirmacion, estado: EstadoDeAfirmacion) -> bool:
    """Única definición de la regla por papel (RN-01): el lenguaje de la lista y el modal normativo descartan la opción en
    cualquier papel; la principal y la salvedad sin respaldo del NLI también. Solo ``soportada_por_nli`` es respaldo."""
    return estado in (
        EstadoDeAfirmacion.lenguaje_no_permitido,
        EstadoDeAfirmacion.modal_normativo,
    ) or (
        papel is not PapelDeAfirmacion.secundaria
        and estado is not EstadoDeAfirmacion.soportada_por_nli
    )
