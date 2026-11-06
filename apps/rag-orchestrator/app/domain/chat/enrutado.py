"""Enrutado de la pregunta del chat (US-259, design D3): reglas puras, sin E/S."""

from __future__ import annotations

from collections.abc import Mapping

from app.domain.chat.estado import Intencion


def es_fuera_de_alcance(
    pregunta: str, tipo_del_contexto: str, terminos_por_tipo: Mapping[str, frozenset[str]]
) -> bool:
    raise NotImplementedError("no implementado")


def clasificar_por_reglas(pregunta: str) -> Intencion | None:
    raise NotImplementedError("no implementado")
