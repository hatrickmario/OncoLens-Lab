"""Agregación de la aplicabilidad por opción (ADR-31, RN-28): regla pura, sin E/S y sin puntaje."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

from app.domain.aplicabilidad_tipos import ResumenDeEstados
from app.domain.applicability_order import clave_de_aplicabilidad

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
    """La opción hereda el resumen de su fuente más aplicable y es no comparable solo si todas sus fuentes lo son.

    ``por_fuente`` sigue el orden del comparador, así que su primera entrada es la que da ``resumen``. Sin fuentes
    evaluadas (ninguna tiene entrada en ``applicability``) el resumen es cero y la opción no se marca no comparable."""
    ordenadas = tuple(sorted(fuentes, key=_clave_de))
    no_comparable = bool(ordenadas) and all(f.poblacion_no_comparable for f in ordenadas)
    return AplicabilidadDeOpcion(
        resumen=ordenadas[0].resumen if ordenadas else ResumenDeEstados(0, 0, 0, 0),
        por_fuente=ordenadas,
        poblacion_no_comparable=no_comparable,
        avisos=(AVISO_POBLACION_NO_COMPARABLE,) if no_comparable else (),
    )


def _clave_de(fuente: FuenteDeLaOpcion) -> tuple[int, int, float, str]:
    return clave_de_aplicabilidad(
        fuente.excluyentes_no_coincide,
        fuente.resumen.coincide,
        fuente.relevance_score,
        fuente.external_id,
    )
