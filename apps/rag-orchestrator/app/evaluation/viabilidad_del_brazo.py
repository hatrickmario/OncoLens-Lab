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
    """``no_viable`` si alguna medición supera su tope (``p95_consulta_s > tope_p95_s``, ``memoria_gb > limite_memoria_gb``,
    ambos estrictos); si no supera ninguno pero falta una medición, ``no_medido``: ``None`` jamás se lee como dentro del
    presupuesto (``null`` ≠ ``0.0``). Los topes llegan de la configuración (``p95_evidence_analyses_s``,
    ``STACK_MEMORY_LIMIT_GB``): aquí no hay ningún literal."""
    motivos = tuple(
        motivo
        for motivo, excede in (
            (MOTIVO_LATENCIA, p95_consulta_s is not None and p95_consulta_s > tope_p95_s),
            (MOTIVO_MEMORIA, memoria_gb is not None and memoria_gb > limite_memoria_gb),
        )
        if excede
    )
    if motivos:
        estado: Estado = "no_viable"
    elif p95_consulta_s is None or memoria_gb is None:
        estado = "no_medido"
    else:
        estado = "viable"
    return Viabilidad(estado, motivos, p95_consulta_s, tope_p95_s, memoria_gb, limite_memoria_gb)
