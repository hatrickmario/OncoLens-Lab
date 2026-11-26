"""Adopción de un brazo frente a la referencia (US-277 AC-5, ADR-45 P6): regla pura, sin E/S ni literales.

Un brazo NO es adoptable si una métrica empeora fuera del ruido (recall o MRR por la tolerancia de retroceso, la proporción de
«sin evidencia» falsos por esa misma tolerancia) o si no cabe en los topes de viabilidad de ADR-39. Lo que la corrida no midió no
se lee como bueno (``null`` ≠ ``0.0``): sin motivos pero con una medición ausente, ``adoptable`` es ``None``.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Final

from app.evaluation.viabilidad_del_brazo import Estado

MOTIVO_RETROCESO: Final = "retroceso"
MOTIVO_FALSOS_SIN_EVIDENCIA: Final = "falsos_sin_evidencia"
MOTIVO_NO_VIABLE: Final = "no_viable"
MOTIVOS_DE_NO_ADOPCION: Final = frozenset(
    {MOTIVO_RETROCESO, MOTIVO_FALSOS_SIN_EVIDENCIA, MOTIVO_NO_VIABLE}
)
"""Los motivos posibles: el esquema del informe los toma de aquí, no los repite."""


@dataclass(frozen=True)
class Adopcion:
    adoptable: bool | None
    motivos: tuple[str, ...]


def decidir_adopcion(
    *,
    retroceso: bool,
    aumento_de_falsos_sin_evidencia: float | None,
    tolerancia: float,
    viabilidad: Estado,
) -> Adopcion:
    raise NotImplementedError("no implementado")
