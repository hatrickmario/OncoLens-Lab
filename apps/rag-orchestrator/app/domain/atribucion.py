"""Marco de atribución y forma de las afirmaciones atómicas (US-245, ADR-34): reglas puras, sin E/S."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from enum import StrEnum

from app.domain.claims import AfirmacionAtomica


class FormaDeAfirmacion(StrEnum):
    valida = "valida"
    alias_de_fragmento = "alias_de_fragmento"
    demasiado_larga = "demasiado_larga"
    modal_normativo = "modal_normativo"


@dataclass(frozen=True)
class ComposicionConMarco:
    rationale: str
    details: tuple[str, ...]


def componer_con_marco(
    afirmaciones: Sequence[AfirmacionAtomica], idioma: str
) -> ComposicionConMarco:
    raise NotImplementedError("no implementado")


def validar_forma_de_afirmacion(texto: str, max_palabras: int) -> FormaDeAfirmacion:
    raise NotImplementedError("no implementado")
