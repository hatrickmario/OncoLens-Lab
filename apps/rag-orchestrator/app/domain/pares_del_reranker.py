"""Corte previo a los pares del reranker (decisión 82 de S1-plan, ADR-39): regla pura, sin E/S."""

from __future__ import annotations

from collections.abc import Sequence
from typing import Protocol


class CandidatoRecuperado(Protocol):
    @property
    def chunk_id(self) -> str: ...

    @property
    def similitud_dense(self) -> float: ...


def recortar_a_pares_del_reranker[T: CandidatoRecuperado](
    candidatos: Sequence[T], max_pares: int
) -> list[T]:
    raise NotImplementedError("no implementado")
