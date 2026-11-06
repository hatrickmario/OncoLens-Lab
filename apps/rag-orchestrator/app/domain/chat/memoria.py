"""Memoria a corto plazo del chat (US-259, design D4): ventana de turnos previos acotada por tokens. Regla pura."""

from __future__ import annotations

from collections.abc import Callable, Sequence

from app.domain.chat.estado import TurnoPrevio


def texto_de_turno(turno: TurnoPrevio) -> str:
    raise NotImplementedError("no implementado")


def ventana_de_memoria(
    turnos: Sequence[TurnoPrevio], presupuesto: int, contar_tokens: Callable[[str], int]
) -> tuple[TurnoPrevio, ...]:
    raise NotImplementedError("no implementado")
