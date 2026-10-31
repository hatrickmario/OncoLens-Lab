"""Fusión de las ramas dense y *sparse* de la recuperación híbrida (US-112, RN-03): regla pura, sin I/O.

La fusión solo elige y ordena candidatos para el *reranker*; su puntaje NUNCA es ``relevance_score`` ni se compara con el
umbral (RN-02, RN-03).
"""

from collections.abc import Sequence
from dataclasses import dataclass
from enum import StrEnum

RRF_K_INICIAL = 60
"""Valor inicial de ``RRF_K`` (ADR-45 P1): el único lugar donde aparece el literal."""
HYBRID_SPARSE_WEIGHT_INICIAL = 0.3
"""Valor inicial de ``HYBRID_SPARSE_WEIGHT`` (ADR-45 P1): el único lugar donde aparece el literal."""


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

    ``ponderada``: ``(1-w)·dense_norm + w·sparse_norm`` con cada rama normalizada a [0, 1] por mínimo y máximo; un chunk
    ausente de una rama aporta 0 por ella, y una rama cuyos candidatos empatan en puntaje les da 1 a todos.
    """
    if estrategia is EstrategiaDeFusion.rrf:
        puntajes = _puntajes_rrf(dense, sparse, rrf_k)
    else:
        puntajes = _puntajes_ponderados(dense, sparse, peso_sparse)
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


def _normalizados(rama: Sequence[CandidatoDeRama]) -> dict[str, float]:
    if not rama:
        return {}
    minimo = min(c.puntaje for c in rama)
    maximo = max(c.puntaje for c in rama)
    amplitud = maximo - minimo
    if amplitud == 0:
        return {c.chunk_id: 1.0 for c in rama}
    return {c.chunk_id: (c.puntaje - minimo) / amplitud for c in rama}


def _puntajes_ponderados(
    dense: Sequence[CandidatoDeRama], sparse: Sequence[CandidatoDeRama], peso_sparse: float
) -> dict[str, float]:
    if not 0.0 < peso_sparse < 1.0:
        raise ValueError("HYBRID_SPARSE_WEIGHT debe estar en el intervalo abierto (0, 1)")
    en_dense, en_sparse = _normalizados(dense), _normalizados(sparse)
    return {
        chunk_id: (1.0 - peso_sparse) * en_dense.get(chunk_id, 0.0)
        + peso_sparse * en_sparse.get(chunk_id, 0.0)
        for chunk_id in en_dense.keys() | en_sparse.keys()
    }
