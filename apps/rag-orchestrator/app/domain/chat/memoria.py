"""Memoria a corto plazo del chat (US-259, design D4): ventana de turnos previos acotada por tokens. Regla pura."""

from __future__ import annotations

from collections.abc import Callable, Sequence

from app.domain.chat.estado import TurnoPrevio


def texto_de_turno(turno: TurnoPrevio) -> str:
    """El turno tal como entra a la memoria del prompt; la misma cadena que se cuenta contra el presupuesto."""
    respuesta = " ".join(turno.textos_de_bloques)
    return f"Pregunta: {turno.pregunta}\nIntención: {turno.intencion}\nRespuesta: {respuesta}"


def ventana_de_memoria(
    turnos: Sequence[TurnoPrevio], presupuesto: int, contar_tokens: Callable[[str], int]
) -> tuple[TurnoPrevio, ...]:
    """Los últimos turnos que caben en ``presupuesto`` tokens, en orden cronológico.

    Recorre desde el más reciente y se detiene en el primero que ya no cabe: nunca salta un turno para meter uno más
    antiguo (la memoria es una cola continua, no una selección)."""
    elegidos: list[TurnoPrevio] = []
    usados = 0
    for turno in reversed(turnos):
        costo = contar_tokens(texto_de_turno(turno))
        if usados + costo > presupuesto:
            break
        elegidos.append(turno)
        usados += costo
    return tuple(reversed(elegidos))
