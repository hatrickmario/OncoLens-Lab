"""Agregación de la aplicabilidad por opción (ADR-31, RN-28): regla pura, sin E/S y sin puntaje."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

from app.domain.aplicabilidad_tipos import ResumenDeEstados

AVISO_POBLACION_NO_COMPARABLE = "poblacion_no_comparable"


@dataclass(frozen=True)
class FuenteDeLaOpcion:
    """Lo mínimo que el comparador necesita de una fuente que cita la opción."""

    external_id: str
    resumen: ResumenDeEstados
    excluyentes_no_coincide: int
    poblacion_no_comparable: bool
    relevance_score: float
    """La de su chunk citado más relevante en esta opción (RN-03): solo desempata."""


@dataclass(frozen=True)
class AplicabilidadDeOpcion:
    resumen: ResumenDeEstados
    por_fuente: tuple[FuenteDeLaOpcion, ...]
    poblacion_no_comparable: bool
    avisos: tuple[str, ...]


def agregar_aplicabilidad_de_opcion(fuentes: Sequence[FuenteDeLaOpcion]) -> AplicabilidadDeOpcion:
    raise NotImplementedError("no implementado")
