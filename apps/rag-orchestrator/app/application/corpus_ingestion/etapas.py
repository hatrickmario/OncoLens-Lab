"""Etapas de la ingesta de un documento: un fallo sale como etapa y clase, nunca como mensaje (RN-14)."""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager


class FalloDeEtapa(Exception):
    """Una etapa de un documento falló: lleva el nombre de la etapa y la clase del error, nunca su mensaje."""

    def __init__(self, etapa: str, causa: Exception) -> None:
        super().__init__(etapa)
        self.etapa = etapa
        self.clase = type(causa).__name__


@contextmanager
def etapa(nombre: str) -> Iterator[None]:
    try:
        yield
    except FalloDeEtapa:
        raise
    except Exception as error:  # noqa: BLE001 - borde de un puerto: lo que falle es de este documento
        raise FalloDeEtapa(nombre, error) from None
