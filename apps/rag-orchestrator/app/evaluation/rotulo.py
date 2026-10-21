"""Rótulo «validada» de las métricas (AC-T5.3, US-072 AC-4): regla pura."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

Rotulo = Literal["validada", "no_validada"]


@dataclass(frozen=True)
class Validacion:
    preguntas_validadas: int
    preguntas_no_validadas: int
    rotulo: Rotulo


def rotular_validada(preguntas_validadas: int, preguntas_no_validadas: int) -> Validacion:
    raise NotImplementedError("no implementado")
