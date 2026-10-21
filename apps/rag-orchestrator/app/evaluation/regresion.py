"""Umbral de regresión del reporte de `evaluate` contra ``eval/configs/regression.yaml`` (US-074, RN-22)."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

AVISO_SIN_BASELINE = "Sin baseline de regresión: umbral no aplicado"


class UmbralesInvalidos(ValueError):
    """``regression.yaml`` no es utilizable; el mensaje nombra la clave, nunca su valor."""


@dataclass(frozen=True)
class Incumplimiento:
    metrica: str
    minimo: float
    actual: float | None


@dataclass(frozen=True)
class ResultadoRegresion:
    aplicado: bool
    incumplimientos: tuple[Incumplimiento, ...]


def cargar_umbrales(ruta: Path) -> dict[str, float]:
    raise NotImplementedError("no implementado")


def comparar_con_regresion(
    reporte: dict[str, Any], umbrales: dict[str, float]
) -> ResultadoRegresion:
    raise NotImplementedError("no implementado")
