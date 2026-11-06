"""Contador de tokens de la memoria del chat (US-259, ``CHAT_MEMORY_MAX_TOKENS``): adapter del puerto ``ContadorDeTokens``.

Usa el ``tokenizer.json`` local del LLM (``tokenizers``, jamás un hub: RN-12). Sin ese archivo montado se usa
``ContadorConservador``. Devuelve un entero, ``0`` para el texto vacío y nunca ``None``.
"""

from __future__ import annotations

from pathlib import Path

from tokenizers import Tokenizer


class ContadorDeTokensLocal:
    def __init__(self, ruta: Path) -> None:
        self._tokenizador = Tokenizer.from_file(str(ruta))
        self._tokenizador.no_truncation()
        self._tokenizador.no_padding()

    def contar(self, texto: str) -> int:
        return len(self._tokenizador.encode(texto, add_special_tokens=False).ids)
