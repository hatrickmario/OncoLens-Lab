"""Descripción determinista de los hechos del caso (US-260, ADR-34): reglas puras, sin E/S."""

from __future__ import annotations

from collections.abc import Sequence

from app.domain.chat.turno import HechoDelCaso


def describir_hecho(hecho: HechoDelCaso) -> str:
    raise NotImplementedError("no implementado")


def describir_hechos(fact_refs: Sequence[str], hechos: Sequence[HechoDelCaso]) -> str:
    raise NotImplementedError("no implementado")


def es_la_descripcion_de(
    texto: str, fact_refs: Sequence[str], hechos: Sequence[HechoDelCaso]
) -> bool:
    raise NotImplementedError("no implementado")
