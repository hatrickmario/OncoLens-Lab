"""Viabilidad de un brazo del reranker frente a los topes de ADR-39 (US-278 AC-5): regla pura, sin E/S ni literales."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

Estado = Literal["viable", "no_viable", "no_medido"]
MOTIVO_LATENCIA = "latencia"
MOTIVO_MEMORIA = "memoria"


@dataclass(frozen=True)
class Viabilidad:
    estado: Estado
    motivos: tuple[str, ...]
    """Los topes superados (``latencia``, ``memoria``); vacío si es viable o no medido sin exceso."""
    p95_consulta_s: float | None
    tope_p95_s: float
    memoria_gb: float | None
    limite_memoria_gb: float


def viabilidad_del_brazo(
    p95_consulta_s: float | None,
    tope_p95_s: float,
    memoria_gb: float | None,
    limite_memoria_gb: float,
) -> Viabilidad:
    raise NotImplementedError("no implementado")
