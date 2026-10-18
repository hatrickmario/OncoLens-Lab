"""Corte previo al reranker (RN-22, RN-03): regla pura, sin E/S."""

from __future__ import annotations

from collections.abc import Sequence
from typing import Protocol, TypeVar


class Candidato(Protocol):
    chunk_id: str
    similitud_dense: float


C = TypeVar("C", bound=Candidato)


def cortar_a_mejores(candidatos: Sequence[C], n: int) -> list[C]:
    raise NotImplementedError
