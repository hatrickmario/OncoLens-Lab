"""Pertinencia de una pregunta de seguimiento (US-218, design D7 `[S5 resp. 13]`): regla pura, sin E/S.

Fuera de contexto si la pregunta (ya enmascarada por ADR-40) trae el marcador de identidad de otra persona, o nombra,
por los términos del catálogo, otro tipo de cáncer sin nombrar el del contexto. Una comparativa que nombra ambos sigue
al pipeline: toda afirmación seguirá necesitando cita del turno y NLI.
"""

from __future__ import annotations

import re
from collections.abc import Mapping
from enum import StrEnum

from app.domain.lenguaje import normalizar_texto


class ContextoDelSeguimiento(StrEnum):
    en_contexto = "en_contexto"
    fuera_de_contexto = "fuera_de_contexto"


MARCADORES_DE_IDENTIDAD: tuple[str, ...] = ("[NOMBRE]", "[DOCUMENTO]", "[TELEFONO]", "[CORREO]")
"""Los marcadores de ``pii-masks.json`` de clinical-api que identifican a una persona (la fecha no la identifica)."""


def clasificar_contexto_del_seguimiento(
    pregunta: str, tipo_del_contexto: str, terminos_por_tipo: Mapping[str, frozenset[str]]
) -> ContextoDelSeguimiento:
    if any(marcador in pregunta for marcador in MARCADORES_DE_IDENTIDAD):
        return ContextoDelSeguimiento.fuera_de_contexto
    texto = normalizar_texto(pregunta)
    if _nombra_el_tipo(texto, tipo_del_contexto, terminos_por_tipo):
        return ContextoDelSeguimiento.en_contexto
    nombra_otro = any(
        _nombra_el_tipo(texto, otro, terminos_por_tipo)
        for otro in terminos_por_tipo
        if otro != tipo_del_contexto
    )
    return (
        ContextoDelSeguimiento.fuera_de_contexto
        if nombra_otro
        else ContextoDelSeguimiento.en_contexto
    )


def _nombra_el_tipo(
    texto_normalizado: str, tipo: str, terminos_por_tipo: Mapping[str, frozenset[str]]
) -> bool:
    terminos = terminos_por_tipo.get(tipo, frozenset())
    return any(re.search(rf"\b{re.escape(t)}\b", texto_normalizado) for t in terminos)
