"""Pertinencia de una pregunta de seguimiento (US-218, design D7): regla pura, sin E/S."""

from __future__ import annotations

from collections.abc import Mapping
from enum import StrEnum


class ContextoDelSeguimiento(StrEnum):
    en_contexto = "en_contexto"
    fuera_de_contexto = "fuera_de_contexto"


MARCADORES_DE_IDENTIDAD: tuple[str, ...] = ("[NOMBRE]", "[DOCUMENTO]", "[TELEFONO]", "[CORREO]")


def clasificar_contexto_del_seguimiento(
    pregunta: str, tipo_del_contexto: str, terminos_por_tipo: Mapping[str, frozenset[str]]
) -> ContextoDelSeguimiento:
    raise NotImplementedError("no implementado")
