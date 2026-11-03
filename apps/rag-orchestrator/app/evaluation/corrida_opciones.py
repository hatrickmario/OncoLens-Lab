"""Corrida de la familia `opciones` de `evaluate` (US-140, L1D-246). Esqueleto: se implementa con el verde de los AC."""

from __future__ import annotations

import argparse
from collections.abc import Callable, Mapping
from dataclasses import dataclass

from app.application.ports import Clock
from app.evaluation.config_opciones import ConfigOpciones
from app.evaluation.dataset_opciones import DatasetOpciones
from app.evaluation.metricas.opciones_mostradas import AnalisisDeOpciones
from app.evaluation.metricas.resultado import ResultadoConsulta
from app.evaluation.modelos_locales import OrigenLocal

SUITE_OPCIONES = "opciones"


@dataclass(frozen=True)
class MedicionDeOpciones:
    analisis: tuple[AnalisisDeOpciones, ...]
    resultados: tuple[ResultadoConsulta, ...]
    version_de_la_lista: str


Medidor = Callable[[ConfigOpciones, DatasetOpciones], MedicionDeOpciones]


@dataclass(frozen=True)
class PuertosDeOpciones:
    medidor: Medidor | None = None


def ejecutar_opciones(
    args: argparse.Namespace,
    ajustes: Mapping[str, str],
    reloj: Clock,
    origen: OrigenLocal,
    puertos: PuertosDeOpciones,
) -> int:
    raise NotImplementedError("no implementado")
