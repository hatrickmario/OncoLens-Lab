"""Composición de los bordes reales del corpus (Milvus y schema ``corpus``) para ``app/main.py`` (US-231b AC-9)."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from app.application.ports import PuertosDelCorpus
from app.config.settings import CorpusDatabaseSettings, MilvusSettings, Settings


class CorpusNoDisponibleError(RuntimeError):
    """El corpus no se puede componer o no responde. El mensaje es solo el NOMBRE de la variable de configuración:
    nunca la URI, el host, el puerto, el DSN ni el motivo del cliente."""

    def __init__(self, variable: str) -> None:
        super().__init__(variable)
        self.variable = variable


def crear_puertos_del_corpus(
    milvus: MilvusSettings,
    base: CorpusDatabaseSettings,
    *,
    fabricar_cliente: Callable[..., Any] | None = None,
    fabricar_motor: Callable[..., Any] | None = None,
) -> PuertosDelCorpus:
    raise NotImplementedError("no implementado")


def puertos_del_corpus_segun_proveedores(settings: Settings) -> PuertosDelCorpus | None:
    raise NotImplementedError("no implementado")
