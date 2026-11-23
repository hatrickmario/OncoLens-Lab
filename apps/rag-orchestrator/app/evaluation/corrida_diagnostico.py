"""Corrida de la familia `diagnostico` de `evaluate` (US-276, L1D-334): en qué etapa de la consulta se pierde el fragmento
esperado cuando dos redacciones del mismo significado dan resultados distintos."""

from __future__ import annotations

import argparse
from collections.abc import Mapping
from dataclasses import dataclass

from app.application.ports import ChunkSearch, Clock
from app.evaluation.composicion_suite import Adaptadores
from app.evaluation.modelos_locales import OrigenLocal

SUITE_DIAGNOSTICO = "diagnostico"


@dataclass(frozen=True)
class PuertosDeDiagnostico:
    """Bordes que un test puede sustituir; sin ellos la familia compone los adaptadores de la configuración."""

    adaptadores: Adaptadores | None = None
    buscador: ChunkSearch | None = None


def ejecutar_diagnostico(
    args: argparse.Namespace,
    ajustes: Mapping[str, str],
    reloj: Clock,
    origen: OrigenLocal,
    puertos: PuertosDeDiagnostico,
) -> int:
    raise NotImplementedError("no implementado")
