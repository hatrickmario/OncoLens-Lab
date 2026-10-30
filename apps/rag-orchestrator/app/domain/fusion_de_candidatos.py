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
    """Candidatos únicos de las dos ramas, de mayor a menor puntaje fusionado; empate por ``chunk_id`` (IA-07).

    ``rrf``: ``Σ 1/(k+rango)`` con rango desde 1 en cada rama. Cada rama se ordena por su propio puntaje antes de
    asignar rangos, así el resultado no depende del orden en que llegó.
    """
    if estrategia is EstrategiaDeFusion.rrf:
        puntajes = _puntajes_rrf(dense, sparse, rrf_k)
    else:
        raise NotImplementedError("no implementado")
    return _ordenados(puntajes)


def _ordenados(puntajes: dict[str, float]) -> list[CandidatoFusionado]:
    ordenados = sorted(puntajes.items(), key=lambda par: (-par[1], par[0]))
    return [CandidatoFusionado(chunk_id, puntaje) for chunk_id, puntaje in ordenados]


def _por_rango(rama: Sequence[CandidatoDeRama]) -> list[str]:
    return [c.chunk_id for c in sorted(rama, key=lambda c: (-c.puntaje, c.chunk_id))]


def _puntajes_rrf(
    dense: Sequence[CandidatoDeRama], sparse: Sequence[CandidatoDeRama], k: int
) -> dict[str, float]:
    if k < 1:
        raise ValueError("RRF_K debe ser un entero >= 1")
    puntajes: dict[str, float] = {}
    for rama in (dense, sparse):
        for rango, chunk_id in enumerate(_por_rango(rama), start=1):
            puntajes[chunk_id] = puntajes.get(chunk_id, 0.0) + 1.0 / (k + rango)
    return puntajes
