"""Recuento de la revisión de las preguntas de un dataset (S7-D1, US-140 AC-5): regla pura."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass


@dataclass(frozen=True)
class RecuentoDeRevision:
    validados: int
    mecanica_verificada: int
    sin_revisar: int


def contar_revision(
    revisadas_por_oncologo: Sequence[bool], con_revision_provisional: Sequence[bool]
) -> RecuentoDeRevision:
    raise NotImplementedError("no implementado")
