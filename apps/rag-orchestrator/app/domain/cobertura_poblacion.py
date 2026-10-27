"""Cobertura de metadatos de población del catálogo del corpus (M-08.3, US-132): reglas puras, sin E/S."""

from __future__ import annotations

from collections.abc import Mapping

NO_DISPONIBLE = "no_disponible"


def tiene_criterios_de_poblacion(population_criteria: Mapping[str, object]) -> bool:
    """Un documento «con metadatos» trae al menos una clave de ``population_criteria`` distinta de ``no_disponible``.

    Un objeto anidado (``biomarcadores``) cuenta si alguna de sus claves lo cumple; ``{}`` no cuenta (decidido, S3 resp. 16)."""
    return any(_declara_valor(valor) for valor in population_criteria.values())


def proporcion_con_criterios(vigentes: int, con_criterios: int) -> float | None:
    """``con_criterios / vigentes``; sin documentos vigentes la cobertura no se mide (``None``, nunca 0,0)."""
    return None if vigentes == 0 else con_criterios / vigentes


def _declara_valor(valor: object) -> bool:
    if isinstance(valor, dict) and "valor" not in valor:
        return any(_declara_valor(v) for v in valor.values())
    return valor != NO_DISPONIBLE
