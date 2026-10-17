"""Umbral de relevancia y `relevance_score` (RN-02, RN-03): reglas puras, sin E/S."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass


@dataclass(frozen=True)
class ChunkPuntuado:
    """Un chunk recuperado con su `relevance_score` (puntaje del reranker normalizado a [0, 1], RN-03)."""

    chunk_id: str
    document_id: str
    chunk_text: str
    relevance_score: float


def filtrar_sobre_umbral(
    chunks_puntuados: Sequence[ChunkPuntuado], umbral: float
) -> list[ChunkPuntuado]:
    return [chunk for chunk in chunks_puntuados if chunk.relevance_score > umbral]


def top_relevance_score(chunks_sobre_umbral: Sequence[ChunkPuntuado]) -> float | None:
    """El máximo de los chunks sobre el umbral; ``None`` —nunca ``0.0``— si no hay ninguno (RN-02)."""
    if not chunks_sobre_umbral:
        return None
    return max(chunk.relevance_score for chunk in chunks_sobre_umbral)


def validar_puntaje_normalizado(puntaje: float) -> float:
    """Un reranker (o un fake) que devuelve un puntaje fuera de [0, 1] rompe el contrato del puerto (RN-03)."""
    if not 0.0 <= puntaje <= 1.0:  # también falsa para NaN
        raise ValueError("el puntaje del reranker debe estar normalizado a [0, 1]")
    return puntaje
