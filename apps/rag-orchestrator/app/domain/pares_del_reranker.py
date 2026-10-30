"""Corte previo a los pares del reranker (decisión 82 de S1-plan, ADR-39): regla pura, sin E/S."""

from __future__ import annotations

from collections.abc import Sequence
from typing import Protocol


class CandidatoRecuperado(Protocol):
    @property
    def chunk_id(self) -> str: ...

    @property
    def puntaje_de_recuperacion(self) -> float: ...


def recortar_a_pares_del_reranker[T: CandidatoRecuperado](
    candidatos: Sequence[T], max_pares: int
) -> list[T]:
    """Los ``max_pares`` mejores por similitud de recuperación; un empate se resuelve por ``chunk_id`` (determinista, IA-07).

    Con menos candidatos que pares no hay nada que recortar. La similitud solo elige candidatos: no es
    ``relevance_score`` (RN-03) ni se compara con el umbral.
    """
    if max_pares <= 0:
        raise ValueError("max_pares debe ser positivo")
    ordenados = sorted(candidatos, key=lambda c: (-c.puntaje_de_recuperacion, c.chunk_id))
    return ordenados[:max_pares]
