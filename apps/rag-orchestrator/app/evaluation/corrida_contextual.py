"""Corrida de la familia `contextual` de `evaluate` (US-271 AC-9, L1D-329)."""

from __future__ import annotations

import argparse
from collections.abc import Callable, Mapping
from dataclasses import dataclass

from app.application.ports import Clock, Reranker
from app.evaluation.modelos_locales import OrigenLocal

SUITE_CONTEXTUAL = "contextual"


def seudonimo_de_la_suite(indice: int) -> str:
    raise NotImplementedError("no implementado")


@dataclass(frozen=True)
class PuertosDeContextual:
    """Bordes que un test puede sustituir; sin ellos la familia compone los adaptadores de la configuración."""

    reranker: Reranker | None = None
    seudonimo: Callable[[int], str] = seudonimo_de_la_suite


def ejecutar_contextual(
    args: argparse.Namespace,
    ajustes: Mapping[str, str],
    reloj: Clock,
    origen: OrigenLocal,
    puertos: PuertosDeContextual,
) -> int:
    raise NotImplementedError("no implementado")
