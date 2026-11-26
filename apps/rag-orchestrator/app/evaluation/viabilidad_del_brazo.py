"""Viabilidad de un brazo del reranker frente a los topes de ADR-39 (US-278 AC-5): regla pura, sin E/S ni literales."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, get_args

Estado = Literal["viable", "no_viable", "no_medido"]
ESTADOS_DE_VIABILIDAD = frozenset(get_args(Estado))
"""Los estados posibles: el esquema del informe los toma de aquí, no los repite."""
MOTIVO_LATENCIA = "latencia"
MOTIVO_MEMORIA = "memoria"
MOTIVOS_DE_NO_VIABILIDAD = frozenset({MOTIVO_LATENCIA, MOTIVO_MEMORIA})
"""Los topes que puede superar un brazo: el esquema del informe los toma de aquí, no los repite."""


@dataclass(frozen=True)
class Viabilidad:
    estado: Estado
    motivos: tuple[str, ...]
    """Los topes superados (``latencia``, ``memoria``); vacío si es viable o no medido sin exceso."""
    p95_consulta_s: float | None
    tope_p95_s: float
    memoria_del_stack_gb: float | None
    limite_memoria_gb: float


def exceso_de_latencia(p95_s: float | None, tope_s: float) -> bool | None:
    """Tri-estado: ``True`` si ``p95_s > tope_s`` (estricto: igual al tope no excede), ``False`` si no, ``None`` (≠ ``False``) si no se midió."""
    return None if p95_s is None else p95_s > tope_s


def viabilidad_del_brazo(
    *,
    p95_consulta_s: float | None,
    tope_p95_s: float,
    memoria_del_stack_gb: float | None,
    limite_memoria_gb: float,
) -> Viabilidad:
    """``no_viable`` si alguna medición supera su tope (``p95_consulta_s > tope_p95_s``,
    ``memoria_del_stack_gb > limite_memoria_gb``, ambos estrictos); si no supera ninguno pero falta una medición,
    ``no_medido``: ``None`` jamás se lee como dentro del presupuesto (``null`` ≠ ``0.0``). Los topes llegan de la
    configuración (``p95_evidence_analyses_s``, ``STACK_MEMORY_LIMIT_GB``): aquí no hay ningún literal. La memoria es la del
    stack completo (con Ollama y Milvus) que mide ``ai-eval-runner``, no el RSS del proceso."""
    motivos = tuple(
        motivo
        for motivo, excede in (
            (MOTIVO_LATENCIA, exceso_de_latencia(p95_consulta_s, tope_p95_s)),
            (
                MOTIVO_MEMORIA,
                memoria_del_stack_gb is not None and memoria_del_stack_gb > limite_memoria_gb,
            ),
        )
        if excede
    )
    if motivos:
        estado: Estado = "no_viable"
    elif p95_consulta_s is None or memoria_del_stack_gb is None:
        estado = "no_medido"
    else:
        estado = "viable"
    return Viabilidad(
        estado, motivos, p95_consulta_s, tope_p95_s, memoria_del_stack_gb, limite_memoria_gb
    )
