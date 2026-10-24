"""Umbral de relevancia y `relevance_score` (RN-02, RN-03): reglas puras, sin E/S."""

from __future__ import annotations

from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass


@dataclass(frozen=True)
class ChunkPuntuado:
    """Un chunk recuperado con su `relevance_score` (puntaje del reranker normalizado a [0, 1], RN-03)."""

    chunk_id: str
    document_id: str
    chunk_text: str
    relevance_score: float


@dataclass(frozen=True)
class RelevanciaDeOpcion:
    """``relevance_score`` de una opción (RN-03) y la cita principal de la que lo hereda."""

    relevance_score: float
    chunk_principal_id: str


def relevancia_de_opcion(
    chunk_ids_validos: Sequence[str], puntajes: Mapping[str, float]
) -> RelevanciaDeOpcion:
    """La de su cita válida más relevante (la cita principal; a igualdad, la de menor ``chunkId``, RN-28).

    Es un metadato de ese chunk, no una medida de la opción ni de su solidez clínica (RN-03).
    """
    principal = min(chunk_ids_validos, key=lambda chunk_id: (-puntajes[chunk_id], chunk_id))
    return RelevanciaDeOpcion(puntajes[principal], principal)


def ordenar_por_relevancia(chunks: Sequence[ChunkPuntuado]) -> list[ChunkPuntuado]:
    """Orden determinista: ``relevance_score`` descendente y ``chunk_id`` ascendente como desempate."""
    return sorted(chunks, key=lambda c: (-c.relevance_score, c.chunk_id))


def supera_umbral(relevance_score: float, umbral: float) -> bool:
    """Un puntaje pasa el umbral solo si lo supera de forma estricta (RN-02); una única definición para producción y la suite."""
    return relevance_score > umbral


def corte_para_el_generador[T](
    ordenados: Sequence[T], top_n: int, umbral: float, puntaje: Callable[[T], float]
) -> list[T]:
    """Lo que el generador recibe de un ranking ya ordenado por relevancia: los ``top_n`` primeros (``RERANK_TOP_N``) y, de
    ellos, los que superan el umbral (RN-02). El orden es el del ranking; la misma regla que sigue el servicio."""
    return [c for c in ordenados[:top_n] if supera_umbral(puntaje(c), umbral)]


def filtrar_sobre_umbral(
    chunks_puntuados: Sequence[ChunkPuntuado], umbral: float
) -> list[ChunkPuntuado]:
    return [chunk for chunk in chunks_puntuados if supera_umbral(chunk.relevance_score, umbral)]


def top_relevance_score(chunks_sobre_umbral: Sequence[ChunkPuntuado]) -> float | None:
    """El máximo de los chunks sobre el umbral; ``None`` —nunca ``0.0``— si no hay ninguno (RN-02)."""
    if not chunks_sobre_umbral:
        return None
    return max(chunk.relevance_score for chunk in chunks_sobre_umbral)
