"""Rótulo «validada» de las métricas (AC-T5.3, US-072 AC-4): regla pura."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, get_args

Rotulo = Literal["validada", "no_validada"]
ROTULOS: tuple[str, ...] = get_args(Rotulo)


@dataclass(frozen=True)
class Validacion:
    preguntas_validadas: int
    preguntas_no_validadas: int
    rotulo: Rotulo


def rotular_validada(preguntas_validadas: int, preguntas_no_validadas: int) -> Validacion:
    """«validada» solo si la métrica se calculó sobre preguntas revisadas por el oncólogo y ninguna sin revisar."""
    validada = preguntas_validadas > 0 and preguntas_no_validadas == 0
    return Validacion(
        preguntas_validadas, preguntas_no_validadas, "validada" if validada else "no_validada"
    )
