"""``ContadorDeTokens`` falso por palabras: cumple el contrato del puerto (entero, ``0`` en vacío, nunca ``None``)."""

from __future__ import annotations


class ContadorPorPalabras:
    """Cuenta una palabra (secuencia sin espacios) como un token y anota cuántas veces se le consultó."""

    def __init__(self) -> None:
        self.consultas = 0

    def contar(self, texto: str) -> int:
        self.consultas += 1
        return len(texto.split())
