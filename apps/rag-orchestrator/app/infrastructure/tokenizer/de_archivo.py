"""Tokenizer de BGE-M3 para trocear la semilla en TOKENS (US-231b AC-8, ``[S1 resp. 38]``)."""

from __future__ import annotations

from pathlib import Path


class TokenizadorDePiezas:
    """``Tokenizador`` del cargador de la semilla: piezas cuya concatenación es el texto, una por token del modelo."""

    def __init__(self, ruta: Path) -> None:
        raise NotImplementedError("no implementado")

    def tokenizar(self, texto: str) -> list[str]:
        raise NotImplementedError("no implementado")
