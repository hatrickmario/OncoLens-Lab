"""Normalización mínima y fragmentación del texto de un documento (US-059 D6, ADR-39)."""

from __future__ import annotations

from typing import Protocol


class Tokenizador(Protocol):
    """Parte un texto en piezas cuya concatenación es el texto original.

    El adapter real usa el tokenizer del modelo de embeddings (ADR-39); el provisional cuenta palabras.
    """

    def tokenizar(self, texto: str) -> list[str]: ...
