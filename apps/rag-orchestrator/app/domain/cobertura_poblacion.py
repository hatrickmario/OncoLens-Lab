"""Cobertura de metadatos de población del catálogo del corpus (M-08.3, US-132): reglas puras, sin E/S."""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass

from app.domain.poblacion_del_estudio import poblacion_desde_lo_guardado


def tiene_criterios_de_poblacion(
    population_criteria: Mapping[str, object], max_valores: int
) -> bool:
    """Un documento «con metadatos» trae al menos un criterio con algún valor, leído con el mismo lector doble que usa la
    aplicabilidad (US-241): ``no_disponible``, ``{}``, ``[]``, la marca ``pendiente`` y una lista de forma inválida no cuentan
    (decidido, S3 resp. 16 y P1-1 del Gate 2)."""
    poblacion = poblacion_desde_lo_guardado("pendiente", population_criteria, max_valores)
    return any(criterio.valores for criterio in poblacion.criterios.values())


@dataclass(frozen=True)
class ConteoDeCobertura:
    vigentes: int
    con_criterios: int


def contar_cobertura(
    criterios_de_vigentes: Iterable[object], max_valores: int
) -> ConteoDeCobertura:
    """Cuenta los documentos vigentes y los que traen criterios; una fila que no es un objeto JSON no cuenta como
    «con metadatos». Única agregación, la usan el adapter SQL y el catálogo en memoria."""
    filas = list(criterios_de_vigentes)
    return ConteoDeCobertura(
        len(filas),
        sum(
            1 for c in filas if isinstance(c, dict) and tiene_criterios_de_poblacion(c, max_valores)
        ),
    )


def proporcion_con_criterios(vigentes: int, con_criterios: int) -> float | None:
    """``con_criterios / vigentes``; sin documentos vigentes la cobertura no se mide (``None``, nunca 0,0)."""
    return None if vigentes == 0 else con_criterios / vigentes
