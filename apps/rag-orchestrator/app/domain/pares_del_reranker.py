"""Corte previo a los pares del reranker (decisión 82 de S1-plan, ADR-39): regla pura, sin E/S."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Protocol


class CandidatoRecuperado(Protocol):
    @property
    def chunk_id(self) -> str: ...

    @property
    def puntaje_de_recuperacion(self) -> float: ...


@dataclass(frozen=True)
class CortadosDelReranker:
    """Los candidatos que el corte dejó fuera, con su puesto 1-based en el orden denso, y cuántos no caben en el log."""

    cortados: tuple[tuple[str, int], ...]
    omitidos: int


def _orden_denso[T: CandidatoRecuperado](candidatos: Sequence[T]) -> list[T]:
    return sorted(candidatos, key=lambda c: (-c.puntaje_de_recuperacion, c.chunk_id))


def recortar_a_pares_del_reranker[T: CandidatoRecuperado](
    candidatos: Sequence[T], max_pares: int
) -> list[T]:
    """Los ``max_pares`` mejores por similitud de recuperación; un empate se resuelve por ``chunk_id`` (determinista, IA-07).

    Con menos candidatos que pares no hay nada que recortar. La similitud solo elige candidatos: no es
    ``relevance_score`` (RN-03) ni se compara con el umbral.
    """
    if max_pares <= 0:
        raise ValueError("max_pares debe ser positivo")
    return _orden_denso(candidatos)[:max_pares]


def cortados_con_puesto(
    candidatos: Sequence[CandidatoRecuperado], max_pares: int, max_ids: int
) -> CortadosDelReranker:
    """Ids y puesto denso (1-based, el mismo orden que ``recortar_a_pares_del_reranker``) de lo que el corte descarta.

    Lista a lo sumo ``max_ids``; el resto solo se cuenta en ``omitidos``. Solo ids del corpus: nunca texto (US-270).
    """
    if max_ids <= 0:
        raise ValueError("max_ids debe ser positivo")
    if max_pares <= 0:
        raise ValueError("max_pares debe ser positivo")
    fuera = [
        (c.chunk_id, max_pares + i + 1) for i, c in enumerate(_orden_denso(candidatos)[max_pares:])
    ]
    return CortadosDelReranker(
        cortados=tuple(fuera[:max_ids]), omitidos=max(0, len(fuera) - max_ids)
    )
