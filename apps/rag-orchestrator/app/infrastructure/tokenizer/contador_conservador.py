"""Contador de tokens conservador de la memoria del chat (US-259): sin ``tokenizers`` ni archivos.

Sin el ``tokenizer.json`` local del LLM montado, estima por caracteres y SOBREESTIMA, de modo que la ventana de memoria
nunca excede el presupuesto real. Devuelve un entero, ``0`` para el texto vacío y nunca ``None``.
"""

from __future__ import annotations

import math

CARACTERES_POR_TOKEN_CONSERVADOR = 3
"""Menos de los ~4 caracteres por token del español: cuenta de más a propósito."""


class ContadorConservador:
    def contar(self, texto: str) -> int:
        return math.ceil(len(texto) / CARACTERES_POR_TOKEN_CONSERVADOR)
