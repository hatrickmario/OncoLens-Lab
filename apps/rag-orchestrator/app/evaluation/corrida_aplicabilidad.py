"""Corrida de la familia `aplicabilidad` de `evaluate` (US-132, L1D-244)."""

from __future__ import annotations

import argparse
from collections.abc import Callable, Sequence
from dataclasses import dataclass

from app.application.ports import Clock, LectorDeCoberturaDePoblacion
from app.evaluation.metricas.aplicabilidad import ParEvaluado

SUITE_APLICABILIDAD = "aplicabilidad"
CODIGO_INVARIANTE_VIOLADA = 3


@dataclass(frozen=True)
class PuertosDeAplicabilidad:
    """Bordes que un test puede sustituir; sin ellos la familia compone los adaptadores falsos de la configuración."""

    evaluador: Callable[..., Sequence[ParEvaluado]] | None = None
    lector_cobertura: LectorDeCoberturaDePoblacion | None = None


def ejecutar_aplicabilidad(
    args: argparse.Namespace, reloj: Clock, puertos: PuertosDeAplicabilidad
) -> int:
    raise NotImplementedError("no implementado")
