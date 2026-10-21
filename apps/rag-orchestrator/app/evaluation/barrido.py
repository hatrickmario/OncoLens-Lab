"""Barrido del umbral de relevancia (US-073, TBD-03, RN-02, RN-22).

``elegir_umbral`` es la regla D1, fijada antes de medir: entre los valores de la grilla cuyo recall@10 no es peor que el del
umbral de referencia menos la tolerancia, el de mayor exactitud de «sin evidencia»; en empate, el más alto (más
conservador frente a RN-02). Es una función pura: no lee archivos ni toca la configuración.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass


@dataclass(frozen=True)
class FilaBarrido:
    """Una fila de la tabla: ``None`` es «sin preguntas de esa clase», nunca 0.0."""

    umbral: float
    exactitud_sin_evidencia: float | None
    recall_at_10: float | None


@dataclass(frozen=True)
class Eleccion:
    umbral: float
    justificacion: str


def sin_nan(valor: float | None) -> float | None:
    """``None`` y NaN son «sin medir»; ambos se informan como ``None``, nunca como 0.0."""
    return None if valor is None or math.isnan(valor) else float(valor)


def _recall_minimo(referencia: FilaBarrido, tolerancia: float) -> float:
    return (referencia.recall_at_10 or 0.0) - tolerancia


def _descarte(fila: FilaBarrido, minimo: float, tolerancia: float) -> str | None:
    if fila.exactitud_sin_evidencia is None or fila.recall_at_10 is None:
        return f"{fila.umbral:.2f} sin medir (falta una clase de preguntas)"
    if fila.recall_at_10 < minimo:
        return (
            f"{fila.umbral:.2f} descartado: recall@10 {fila.recall_at_10:.3f} < {minimo:.3f} "
            f"(recall de la referencia menos la tolerancia {tolerancia:g})"
        )
    return None


def elegir_umbral(
    filas: Sequence[FilaBarrido], umbral_de_referencia: float, tolerancia_recall: float
) -> Eleccion:
    referencia = next((f for f in filas if f.umbral == umbral_de_referencia), None)
    if referencia is None:
        raise ValueError("el umbral de referencia no está en la grilla")
    minimo = _recall_minimo(referencia, tolerancia_recall)
    descartes = [_descarte(f, minimo, tolerancia_recall) for f in filas]
    candidatas = [f for f, d in zip(filas, descartes) if d is None]
    elegida = max(
        candidatas or [referencia],
        key=lambda f: (f.exactitud_sin_evidencia or 0.0, f.umbral),
    )
    motivos = "; ".join(d for d in descartes if d)
    return Eleccion(
        elegida.umbral,
        f"regla D1: mayor exactitud de «sin evidencia» con recall@10 ≥ {minimo:.3f} "
        f"(referencia {umbral_de_referencia:.2f}, tolerancia {tolerancia_recall:g}); empate → el más alto."
        + (f" {motivos}." if motivos else ""),
    )
