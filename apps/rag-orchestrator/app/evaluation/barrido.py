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
    recall_at_10_tras_umbral: float | None


@dataclass(frozen=True)
class Eleccion:
    umbral: float
    justificacion: str


def sin_nan(valor: float | None) -> float | None:
    """``None`` y NaN son «sin medir»; ambos se informan como ``None``, nunca como 0.0."""
    return None if valor is None or math.isnan(valor) else float(valor)


def _recall_minimo(referencia: FilaBarrido, tolerancia: float) -> float:
    return (referencia.recall_at_10_tras_umbral or 0.0) - tolerancia


def _descarte(fila: FilaBarrido, minimo: float, tolerancia: float) -> str | None:
    if fila.exactitud_sin_evidencia is None or fila.recall_at_10_tras_umbral is None:
        return f"{fila.umbral:.2f} sin medir (falta una clase de preguntas)"
    if fila.recall_at_10_tras_umbral < minimo:
        return (
            f"{fila.umbral:.2f} descartado: recall@10 {fila.recall_at_10_tras_umbral:.3f} < {minimo:.3f} "
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


@dataclass(frozen=True)
class FilaDeCalibracion:
    """Una fila del barrido de ``NLI_ENTAILMENT_THRESHOLD`` o de ``RETRIEVAL_TOP_K`` (US-120 AC-5).

    ``valor`` es el umbral o el ``k`` barrido; ``None`` en una métrica es «sin medir», nunca 0.0."""

    valor: float
    fidelidad: float | None
    precision_citas: float | None
    sin_evidencia: float | None
    recall_at_10: float | None
    mrr: float | None
    p95_busqueda_ms: float | None = None


@dataclass(frozen=True)
class MetasDeEntailment:
    """Las metas (iniciales, ``metas-iniciales.yaml``) que debe cumplir un umbral de entailment para ser elegible."""

    precision_citas_minima: float
    sin_evidencia_minima: float


@dataclass(frozen=True)
class EleccionDeCalibracion:
    valor: float
    justificacion: str
    sin_valor_elegible: bool = False
    """``True``: ningún valor de la grilla cumplió la regla y se conserva el provisional (no se inventa uno)."""


def _umbral(valor: float) -> str:
    return f"{valor:.2f}"


def _entero(valor: float) -> str:
    return f"{valor:g}"


def _sin_valor_elegible(
    provisional: float, motivos: Sequence[str], formato: str
) -> EleccionDeCalibracion:
    detalle = f" {'; '.join(motivos)}." if motivos else ""
    return EleccionDeCalibracion(
        provisional,
        f"sin valor elegible: se conserva el provisional {formato}.{detalle}",
        sin_valor_elegible=True,
    )


def _descarte_de_entailment(fila: FilaDeCalibracion, metas: MetasDeEntailment) -> str | None:
    nombre = _umbral(fila.valor)
    if fila.fidelidad is None or fila.precision_citas is None or fila.sin_evidencia is None:
        return f"{nombre} sin medir (falta una métrica)"
    motivos = []
    if fila.precision_citas < metas.precision_citas_minima:
        motivos.append(
            f"precisión de citas {fila.precision_citas:.3f} < {metas.precision_citas_minima:.3f}"
        )
    if fila.sin_evidencia < metas.sin_evidencia_minima:
        motivos.append(f"sin evidencia {fila.sin_evidencia:.3f} < {metas.sin_evidencia_minima:.3f}")
    return f"{nombre} descartado: {', '.join(motivos)}" if motivos else None


def elegir_umbral_entailment(
    filas: Sequence[FilaDeCalibracion], metas: MetasDeEntailment, provisional: float
) -> EleccionDeCalibracion:
    """El umbral de mayor fidelidad entre los que cumplen las metas de precisión de citas y de «sin evidencia»; en empate, el más
    alto (más conservador, RN-01). Sin ninguno elegible conserva el provisional y lo marca (RN-22, regla de D3)."""
    descartes = [_descarte_de_entailment(f, metas) for f in filas]
    elegibles = [f for f, d in zip(filas, descartes) if d is None]
    motivos = [d for d in descartes if d]
    if not elegibles:
        return _sin_valor_elegible(provisional, motivos, _umbral(provisional))
    elegida = max(elegibles, key=lambda f: (f.fidelidad or 0.0, f.valor))
    return EleccionDeCalibracion(
        elegida.valor,
        "regla D3: mayor fidelidad con precisión de citas ≥ "
        f"{metas.precision_citas_minima:.3f} y sin evidencia ≥ {metas.sin_evidencia_minima:.3f}; "
        "empate → el más alto." + (f" {'; '.join(motivos)}." if motivos else ""),
    )


_EPSILON_DE_COMPARACION = 1e-9


def _descarte_de_top_k(
    fila: FilaDeCalibracion, minimo_de_recall: float | None, p95_maximo_ms: float | None
) -> str | None:
    nombre = _entero(fila.valor)
    if fila.recall_at_10 is None:
        return f"{nombre} sin medir (falta recall@10)"
    if (
        minimo_de_recall is not None
        and fila.recall_at_10 < minimo_de_recall - _EPSILON_DE_COMPARACION
    ):
        return f"{nombre} descartado: recall@10 {fila.recall_at_10:.3f} < {minimo_de_recall:.3f}"
    if (
        p95_maximo_ms is not None
        and fila.p95_busqueda_ms is not None
        and fila.p95_busqueda_ms > p95_maximo_ms
    ):
        return f"{nombre} descartado: p95 de búsqueda {fila.p95_busqueda_ms:g} ms > {p95_maximo_ms:g} ms"
    return None


def elegir_top_k(
    filas: Sequence[FilaDeCalibracion],
    tolerancia_recall: float,
    provisional: float,
    p95_maximo_ms: float | None = None,
) -> EleccionDeCalibracion:
    """El menor ``k`` cuyo recall@10 queda dentro de la tolerancia del mejor de la grilla y cuyo p95 de búsqueda no supera el
    límite (si se declara). Sin ninguno elegible conserva el provisional y lo marca (RN-22, regla de D3)."""
    medidas = [f.recall_at_10 for f in filas if f.recall_at_10 is not None]
    minimo = max(medidas) - tolerancia_recall if medidas else None
    descartes = [_descarte_de_top_k(f, minimo, p95_maximo_ms) for f in filas]
    elegibles = [f for f, d in zip(filas, descartes) if d is None]
    motivos = [d for d in descartes if d]
    if not elegibles or minimo is None:
        return _sin_valor_elegible(provisional, motivos, _entero(provisional))
    elegida = min(elegibles, key=lambda f: f.valor)
    limite = " y p95 de búsqueda dentro del límite" if p95_maximo_ms is not None else ""
    return EleccionDeCalibracion(
        elegida.valor,
        f"regla D3: menor k con recall@10 ≥ {minimo:.3f} (tolerancia {tolerancia_recall:g} frente al mejor){limite}."
        + (f" {'; '.join(motivos)}." if motivos else ""),
    )
