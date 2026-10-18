"""Tokenizador por palabras: SOLO doble de los tests del cargador de la semilla (mismo ``Protocol`` que el real).

ADR-39 mide el chunk en TOKENS del tokenizer del modelo de embeddings: en producción el cargador usa
``TokenizadorDePiezas`` (US-231b). Este doble cuenta palabras (secuencias sin espacios, con su espacio final para poder
reconstruir el texto) y solo se usa cuando un test inyecta un embedder falso; ``fragmentar()`` no distingue entre ambos.
"""

from __future__ import annotations

import re

_PALABRA_CON_ESPACIO = re.compile(r"\S+\s*")


class TokenizadorPorPalabras:
    def tokenizar(self, texto: str) -> list[str]:
        """Piezas cuya concatenación es el texto original (sin perder espacios ni saltos de línea)."""
        return _PALABRA_CON_ESPACIO.findall(texto)
