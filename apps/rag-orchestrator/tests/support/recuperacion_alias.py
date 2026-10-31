"""FX-06a-c: recuperación con cuatro chunks sobre el umbral (puntajes distintos y un empate) para US-236.

Orden esperado por ``relevance_score`` descendente y ``chunkId`` ascendente: ``ch-m2-1`` (C1), ``ch-m1-1`` (C2),
``ch-m3-1`` (C3) y ``ch-m3-2`` (C4, empatado con ``ch-m3-1``). La variante ``con_cuarto_bajo_el_umbral`` deja
``ch-m3-2`` por debajo del umbral de los tests (0.30): solo existen C1…C3 (AC-6). Solo datos sintéticos.
"""

from __future__ import annotations

from tests.support.generador_llm import generador_con_llm
from tests.support.llm_falso import FakeLlmClient
from tests.support.recuperacion import (
    CORPUS_FX06A,
    Q_HER2,
    BuscadorFalso,
    ChunkFx,
    EntornoDeRecuperacion,
    RerankerFalso,
    _vector,
    crear_entorno,
)

_CH_M1_1 = next(c for c in CORPUS_FX06A if c.chunk_id == "ch-m1-1")

CHUNKS_FX06A_C: tuple[ChunkFx, ...] = (
    _CH_M1_1,
    ChunkFx(
        "ch-m2-1",
        "doc-m1",
        "Trastuzumab for twelve months is the reference duration in adjuvant HER2 trials.",
        _vector(e0=0.8, e3=0.1),
        True,
        "mama",
    ),
    ChunkFx(
        "ch-m3-1",
        "doc-m1",
        "Pertuzumab added to trastuzumab improved invasive disease-free survival in node-positive disease.",
        _vector(e0=0.7),
        True,
        "mama",
    ),
    ChunkFx(
        "ch-m3-2",
        "doc-m1",
        "Neratinib as extended adjuvant therapy reduced recurrences in hormone receptor positive subgroups.",
        _vector(e0=0.6),
        True,
        "mama",
    ),
)
TEXTO_DE_CH_M1_1 = _CH_M1_1.texto
ORDEN_ESPERADO = ("ch-m2-1", "ch-m1-1", "ch-m3-1", "ch-m3-2")

PUNTAJES_CUATRO_SOBRE_EL_UMBRAL = {
    "ch-m2-1": 0.95,
    "ch-m1-1": 0.87,
    "ch-m3-1": 0.60,
    "ch-m3-2": 0.60,
}
PUNTAJES_TRES_SOBRE_EL_UMBRAL = {**PUNTAJES_CUATRO_SOBRE_EL_UMBRAL, "ch-m3-2": 0.10}


def entorno_con_alias(
    llm: FakeLlmClient, *, con_cuarto_bajo_el_umbral: bool = False
) -> EntornoDeRecuperacion:
    puntajes = (
        PUNTAJES_TRES_SOBRE_EL_UMBRAL
        if con_cuarto_bajo_el_umbral
        else PUNTAJES_CUATRO_SOBRE_EL_UMBRAL
    )
    return crear_entorno(
        buscador=BuscadorFalso(chunks=CHUNKS_FX06A_C),
        reranker=RerankerFalso(puntajes={Q_HER2: puntajes}),
        generador=generador_con_llm(llm),
    )
