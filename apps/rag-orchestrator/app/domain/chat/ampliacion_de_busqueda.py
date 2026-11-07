"""Aviso de que la búsqueda se amplió con datos del caso (US-271, ADR-52, RN-19, RN-10, RN-11): regla pura, sin E/S.

Lo arma el código desde los campos del conjunto cerrado de ``contextExpansion.fields``, nunca el LLM, y nombra campos, jamás
valores del caso.
"""

from __future__ import annotations

from collections.abc import Sequence

from app.domain.expansion_contextual import (
    CAMPO_BIOMARCADOR_PRINCIPAL,
    CAMPO_ESTADIO,
    CAMPO_TIPO,
)

_NOMBRE_EN_EL_AVISO = {
    CAMPO_TIPO: "tipo",
    CAMPO_ESTADIO: "estadio",
    CAMPO_BIOMARCADOR_PRINCIPAL: "biomarcador",
}
"""El nombre con que el aviso llama a cada campo del conjunto cerrado."""


def aviso_de_busqueda_ampliada(prefijo: str, campos: Sequence[str]) -> str:
    """``<prefijo>: tipo, estadio y biomarcador``: los campos realmente usados, unidos con comas y «y» (sin valores)."""
    nombres = [_NOMBRE_EN_EL_AVISO[campo] for campo in campos]
    unidos = nombres[0] if len(nombres) == 1 else f"{', '.join(nombres[:-1])} y {nombres[-1]}"
    return f"{prefijo}: {unidos}"
