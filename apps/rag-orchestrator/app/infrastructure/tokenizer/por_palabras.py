"""Tokenizador PROVISIONAL por palabras para el cargador de la semilla (US-059, ADR-39 propuesto).

ADR-39 mide el chunk en TOKENS del tokenizer del modelo de embeddings elegido. Mientras el adapter real de L1D-106 no
exista, la semilla cuenta palabras (secuencias sin espacios, con su espacio final para poder reconstruir el texto).
Cuando L1D-106 aporte el tokenizer del modelo, este adapter se sustituye sin tocar ``fragmentar()``.
"""

from __future__ import annotations

import re

_PALABRA_CON_ESPACIO = re.compile(r"\S+\s*")


class TokenizadorPorPalabras:
    def tokenizar(self, texto: str) -> list[str]:
        """Piezas cuya concatenación es el texto original (sin perder espacios ni saltos de línea)."""
        return _PALABRA_CON_ESPACIO.findall(texto)
