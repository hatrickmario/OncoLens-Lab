"""Corte previo al reranker (RN-22, RN-03): regla pura, sin E/S."""

from __future__ import annotations

from collections.abc import Sequence
from typing import Protocol


class Candidato(Protocol):
    chunk_id: str
    similitud_dense: float


def cortar_a_mejores[C: Candidato](candidatos: Sequence[C], n: int) -> list[C]:
    """Los ``n`` de mayor similitud dense; empate estable por ``chunk_id``. Solo ordena el corte, no puntúa (RN-03)."""
    return sorted(candidatos, key=lambda c: (-c.similitud_dense, c.chunk_id))[:n]
