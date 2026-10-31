"""Marco de atribución y forma de las afirmaciones atómicas (US-245, ADR-34): reglas puras, sin E/S.

El LLM nunca escribe la atribución: el código antepone el marco a cada afirmación (como la verbalización de ADR-34) y
aparta del NLI las que llegan fuera de forma (alias de fragmento, demasiado largas o con modal normativo).
"""

from __future__ import annotations

import re
from collections.abc import Sequence
from dataclasses import dataclass
from enum import StrEnum

from app.domain.calidad_de_texto import tiene_artefactos
from app.domain.claims import AfirmacionAtomica, PapelDeAfirmacion
from app.domain.lenguaje import normalizar_texto
from app.domain.modales_normativos import MODALES_NORMATIVOS

MARCO_ES = "La fuente reporta que "
MARCO_EN = "The source reports that "
CLAIM_MAX_WORDS_INICIAL = 20
"""Valor inicial de ``CLAIM_MAX_WORDS`` (RN-22): lo calibra la evaluación; producción lo lee de la configuración."""
MAX_DETALLES = 2
"""``EvidenceOption.details`` admite hasta 2 párrafos (contrato): lo que excede se agrupa en el último."""

_ALIAS_DE_FRAGMENTO = re.compile(r"\b(?:fragmentos?\s+)?C[1-9][0-9]*\b", re.IGNORECASE)


class FormaDeAfirmacion(StrEnum):
    valida = "valida"
    alias_de_fragmento = "alias_de_fragmento"
    con_artefactos = "con_artefactos"
    demasiado_larga = "demasiado_larga"
    modal_normativo = "modal_normativo"


@dataclass(frozen=True)
class ComposicionConMarco:
    rationale: str
    details: tuple[str, ...]


def marco_de_atribucion(idioma: str) -> str:
    return MARCO_EN if idioma == "en" else MARCO_ES


def componer_con_marco(
    afirmaciones: Sequence[AfirmacionAtomica], idioma: str
) -> ComposicionConMarco:
    """``rationale`` = marco + la principal; cada secundaria y salvedad, con el mismo marco, en su orden de llegada."""
    marco = marco_de_atribucion(idioma)
    principal = next(a for a in afirmaciones if a.papel is PapelDeAfirmacion.principal)
    restantes = [
        marco + a.texto for a in afirmaciones if a.papel is not PapelDeAfirmacion.principal
    ]
    return ComposicionConMarco(marco + principal.texto, _agrupar_en_detalles(restantes))


def _agrupar_en_detalles(textos: list[str]) -> tuple[str, ...]:
    if len(textos) <= MAX_DETALLES:
        return tuple(textos)
    return (*textos[: MAX_DETALLES - 1], ". ".join(textos[MAX_DETALLES - 1 :]))


def validar_forma_de_afirmacion(texto: str, max_palabras: int) -> FormaDeAfirmacion:
    """El modal normativo precede (descarta la opción en cualquier papel, D-a); alias, artefactos y longitud siguen la regla del papel."""
    if _tiene_modal_normativo(texto):
        return FormaDeAfirmacion.modal_normativo
    if _ALIAS_DE_FRAGMENTO.search(texto):
        return FormaDeAfirmacion.alias_de_fragmento
    if tiene_artefactos(texto):
        return FormaDeAfirmacion.con_artefactos
    if len(texto.split()) > max_palabras:
        return FormaDeAfirmacion.demasiado_larga
    return FormaDeAfirmacion.valida


def _tiene_modal_normativo(texto: str) -> bool:
    palabras = normalizar_texto(texto).split()
    return any(
        tuple(palabras[i : i + len(modal)]) == modal
        for modal in MODALES_NORMATIVOS
        for i in range(len(palabras) - len(modal) + 1)
    )
