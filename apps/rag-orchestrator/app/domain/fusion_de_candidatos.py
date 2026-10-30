"""Fusión de las ramas dense y *sparse* de la recuperación híbrida (US-112, RN-03): regla pura, sin I/O.

La fusión solo elige y ordena candidatos para el *reranker*; su puntaje NUNCA es ``relevance_score`` ni se compara con el
umbral (RN-02, RN-03).
"""

from collections.abc import Sequence
from dataclasses import dataclass
from enum import StrEnum


class EstrategiaDeFusion(StrEnum):
    rrf = "rrf"
    ponderada = "ponderada"


@dataclass(frozen=True)
class CandidatoDeRama:
    """Un acierto de una rama con su puntaje propio (similitud dense o producto interno *sparse*)."""

    chunk_id: str
    puntaje: float


@dataclass(frozen=True)
class CandidatoFusionado:
    chunk_id: str
    puntaje: float
    """Puntaje de recuperación fusionado: elige candidatos, no mide relevancia."""


def fusionar_candidatos(
    dense: Sequence[CandidatoDeRama],
    sparse: Sequence[CandidatoDeRama],
    estrategia: EstrategiaDeFusion,
    *,
    rrf_k: int,
    peso_sparse: float,
) -> list[CandidatoFusionado]:
    raise NotImplementedError("no implementado")
