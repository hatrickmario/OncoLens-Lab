"""Normalización mínima y fragmentación del texto de un documento (US-059 D6, ADR-39)."""

from __future__ import annotations

import re
import unicodedata
from typing import Protocol

_ESPACIOS_SIN_SALTO = re.compile(r"[^\S\n]+")
_SALTOS_DE_MAS = re.compile(r"\n{3,}")


class Tokenizador(Protocol):
    """Parte un texto en piezas cuya concatenación es el texto original.

    El adapter real usa el tokenizer del modelo de embeddings (ADR-39); el provisional cuenta palabras.
    """

    def tokenizar(self, texto: str) -> list[str]: ...


def normalizar_texto(texto: str) -> str:
    """Unicode NFC, saltos de línea ``\\n``, espacios colapsados y sin espacios en los extremos de cada línea.

    Es lo único que se le hace al texto antes de calcular su ``checksum`` y fragmentarlo: sin limpieza semántica.
    """
    unificado = unicodedata.normalize("NFC", texto).replace("\r\n", "\n").replace("\r", "\n")
    lineas = (_ESPACIOS_SIN_SALTO.sub(" ", linea).strip() for linea in unificado.split("\n"))
    return _SALTOS_DE_MAS.sub("\n\n", "\n".join(lineas)).strip()


def fragmentar(texto: str, tokenizador: Tokenizador, *, tamano: int, solape: int) -> list[str]:
    """Ventanas de ``tamano`` tokens que avanzan ``tamano - solape``; la última llega al final del texto."""
    if tamano <= 0:
        raise ValueError("tamano debe ser positivo")
    if not 0 <= solape < tamano:
        raise ValueError("solape debe ser no negativo y menor que el tamano")
    tokens = tokenizador.tokenizar(texto)
    paso = tamano - solape
    chunks: list[str] = []
    for inicio in range(0, len(tokens), paso):
        chunks.append("".join(tokens[inicio : inicio + tamano]).strip())
        if inicio + tamano >= len(tokens):
            break
    return chunks
