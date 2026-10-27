"""Cobertura de metadatos de población del catálogo del corpus (M-08.3, US-132): reglas puras, sin E/S."""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass

from app.domain.corpus_seed.poblacion import NO_DISPONIBLE


def tiene_criterios_de_poblacion(population_criteria: Mapping[str, object]) -> bool:
    """Un documento «con metadatos» trae al menos una clave de ``population_criteria`` distinta de ``no_disponible``.

    Un objeto anidado (``biomarcadores``) cuenta si alguna de sus claves lo cumple; ``{}`` no cuenta (decidido, S3 resp. 16)."""
    return any(_declara_valor(valor) for valor in population_criteria.values())


@dataclass(frozen=True)
class ConteoDeCobertura:
    vigentes: int
    con_criterios: int


def contar_cobertura(criterios_de_vigentes: Iterable[object]) -> ConteoDeCobertura:
    """Cuenta los documentos vigentes y los que traen criterios; una fila que no es un objeto JSON no cuenta como
    «con metadatos». Única agregación, la usan el adapter SQL y el catálogo en memoria."""
    filas = list(criterios_de_vigentes)
    return ConteoDeCobertura(
        len(filas),
        sum(1 for c in filas if isinstance(c, dict) and tiene_criterios_de_poblacion(c)),
    )


def proporcion_con_criterios(vigentes: int, con_criterios: int) -> float | None:
    """``con_criterios / vigentes``; sin documentos vigentes la cobertura no se mide (``None``, nunca 0,0)."""
    return None if vigentes == 0 else con_criterios / vigentes


def _declara_valor(valor: object) -> bool:
    if isinstance(valor, dict) and "valor" not in valor:
        return any(_declara_valor(v) for v in valor.values())
    return valor != NO_DISPONIBLE
