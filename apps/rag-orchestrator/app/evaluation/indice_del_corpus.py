"""Fuente ``indice`` del corpus de la suite `evaluate` (L1D-326, ``[S7 resp. 10]``): lee en SOLO LECTURA la ingesta."""

from __future__ import annotations

from collections.abc import Callable, Iterable
from dataclasses import dataclass
from typing import Any

from app.application.ports import PuertosDelCorpus
from app.evaluation.fuente_dataset import DatasetSuite


@dataclass(frozen=True)
class ResumenDelIndice:
    """Lo que el reporte declara del corpus leído: colección, chunks vigentes y huella de sus ids; nunca texto."""

    coleccion: str
    chunks_vigentes: int
    huella: str


@dataclass(frozen=True)
class IndiceDelCorpus:
    puertos: PuertosDelCorpus
    resumen: ResumenDelIndice


def huella_de_chunks(chunk_ids: Iterable[str]) -> str:
    raise NotImplementedError("no implementado")


def exigir_indice_utilizable(resumen: ResumenDelIndice) -> None:
    raise NotImplementedError("no implementado")


def indice_fingido(dataset: DatasetSuite, vectores: Any) -> IndiceDelCorpus:
    raise NotImplementedError("no implementado")


def abrir_indice_real(
    *,
    fabricar_cliente: Callable[..., Any] | None = None,
    fabricar_motor: Callable[..., Any] | None = None,
) -> IndiceDelCorpus:
    raise NotImplementedError("no implementado")
