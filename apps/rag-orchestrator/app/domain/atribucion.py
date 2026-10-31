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

SUJETO_ES, VERBO_ES, CONECTOR_ES = "La fuente", "reporta", "que"
SUJETO_EN, VERBO_EN, CONECTOR_EN = "The source", "reports", "that"
MARCO_ES = f"{SUJETO_ES} {VERBO_ES} {CONECTOR_ES} "
MARCO_EN = f"{SUJETO_EN} {VERBO_EN} {CONECTOR_EN} "

# Fórmula de atribución «La fuente [cita] describe que…» (ARR-03 AC-3): la deriva de los marcos de arriba y tolera los
# verbos equivalentes y la cita opcional. Una sola fuente: si el marco cambia, la fórmula que mide la suite cambia con él.
_VERBOS_EQUIVALENTES = ("describe", "describen", "reporta", "reportan", "describes", "reports")
FORMULA_DE_ATRIBUCION = re.compile(
    rf"^\s*(?:{re.escape(SUJETO_ES)}|{re.escape(SUJETO_EN)})\s+(?:\[[^\]]*\]\s+)?"
    rf"(?:{'|'.join(dict.fromkeys((VERBO_ES, VERBO_EN, *_VERBOS_EQUIVALENTES)))})\s+"
    rf"(?:{CONECTOR_ES}|{CONECTOR_EN})\b",
    re.IGNORECASE,
)

CLAIMS_MIN_INICIAL = 1
CLAIMS_MAX_INICIAL = 4
CLAIM_MAX_WORDS_INICIAL = 20
"""Valores iniciales de ``CLAIMS_MIN_PER_OPTION``, ``CLAIMS_MAX_PER_OPTION`` y ``CLAIM_MAX_WORDS`` (RN-22): los calibra la
evaluación; producción y la suite los reciben de la configuración y nunca de un literal."""
CIERRES_DE_ORACION = (".", ";", "?", "!")
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
    return (*textos[: MAX_DETALLES - 1], _unir_oraciones(textos[MAX_DETALLES - 1 :]))


def _unir_oraciones(textos: list[str]) -> str:
    """Une con un espacio si la oración previa ya cierra con signo y con «. » si no: nunca «..»."""
    unido = textos[0]
    for texto in textos[1:]:
        unido += (" " if unido.endswith(CIERRES_DE_ORACION) else ". ") + texto
    return unido


def validar_forma_de_afirmacion(texto: str, max_palabras: int) -> FormaDeAfirmacion:
    """El modal normativo precede a alias, artefactos y longitud; la afirmación fuera de forma sigue la regla del papel (D4-20)."""
    if tiene_modal_normativo(texto):
        return FormaDeAfirmacion.modal_normativo
    if _ALIAS_DE_FRAGMENTO.search(texto):
        return FormaDeAfirmacion.alias_de_fragmento
    if tiene_artefactos(texto):
        return FormaDeAfirmacion.con_artefactos
    if len(texto.split()) > max_palabras:
        return FormaDeAfirmacion.demasiado_larga
    return FormaDeAfirmacion.valida


def tiene_modal_normativo(texto: str) -> bool:
    """El texto trae alguno de los modales normativos de ``MODALES_NORMATIVOS`` como palabras completas (acentos y mayúsculas indistintos)."""
    palabras = normalizar_texto(texto).split()
    return any(
        tuple(palabras[i : i + len(modal)]) == modal
        for modal in MODALES_NORMATIVOS
        for i in range(len(palabras) - len(modal) + 1)
    )
