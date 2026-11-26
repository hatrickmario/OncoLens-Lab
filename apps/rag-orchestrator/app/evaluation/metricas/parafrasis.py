"""Reglas puras de la proporción de paráfrasis que recupera un brazo (US-277 AC-2): sin E/S, sin adaptadores.

Un par de ``parafrasis-v1`` son dos redacciones del mismo significado. El par es *aplicable* a la comparación cuando, en el brazo de
referencia, una redacción obtiene la evidencia y otra la pierde ANTES de la generación (en la recuperación, en el corte de pares o
en el umbral de relevancia: RN-02). La proporción dice cuántos de esos pares recupera el brazo: todas sus redacciones con evidencia.
``None`` (≠ ``0.0``) = no hay pares aplicables, no «ningún par recuperado».
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass


@dataclass(frozen=True)
class ProporcionDeParafrasis:
    aplicables: int
    recuperadas: int
    proporcion: float | None
    sin_pares_aplicables: bool


def proporcion_de_parafrasis_recuperadas(
    pares: Mapping[str, tuple[str, ...]],
    con_evidencia_en_la_referencia: Mapping[str, bool],
    con_evidencia_en_el_brazo: Mapping[str, bool],
) -> ProporcionDeParafrasis:
    raise NotImplementedError("no implementado")
