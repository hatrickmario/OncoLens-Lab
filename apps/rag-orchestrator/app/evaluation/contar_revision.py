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
    """Una pregunta es «validada» solo si la revisó un oncólogo; con solo revisión provisional (de IA) es de «mecánica
    verificada»; sin ninguna, «sin revisar». La revisión de IA nunca produce «validada» (``[S7 resp. 1]``)."""
    if len(revisadas_por_oncologo) != len(con_revision_provisional):
        raise ValueError("las dos secuencias de revisión deben tener el mismo largo")
    validados = sum(revisadas_por_oncologo)
    mecanica = sum(
        provisional and not validada
        for validada, provisional in zip(revisadas_por_oncologo, con_revision_provisional)
    )
    return RecuentoDeRevision(
        validados, mecanica, len(revisadas_por_oncologo) - validados - mecanica
    )
