"""Jueces de la fidelidad por afirmación (US-072 AC-3, ADR-41): NLI principal y LLM local secundario."""

from __future__ import annotations

from collections.abc import Sequence
from typing import Protocol

import httpx


class JuezNoDisponible(RuntimeError):
    """El juez no respondió o su respuesta no se pudo interpretar; el mensaje nunca lleva textos."""


class JuezFidelidad(Protocol):
    async def soporta(self, afirmacion: str, premisas: Sequence[str]) -> bool:
        """``True`` si la afirmación se desprende de las premisas (los chunks que cita)."""
        ...


class JuezLlmLocal:
    def __init__(
        self,
        cliente: httpx.AsyncClient,
        *,
        modelo: str,
        temperatura: float,
        semilla: int,
    ) -> None:
        self._cliente = cliente
        self._modelo = modelo
        self._temperatura = temperatura
        self._semilla = semilla

    async def soporta(self, afirmacion: str, premisas: Sequence[str]) -> bool:
        raise NotImplementedError("no implementado")
