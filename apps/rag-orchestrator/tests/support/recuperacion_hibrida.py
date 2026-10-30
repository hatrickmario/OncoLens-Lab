"""FX-06a-a ampliado para la recuperación híbrida (US-112): ``ch-m2-1`` solo lo halla la rama *sparse*.

Los fakes de las dos ramas cumplen el contrato de los adapters reales (filtro compartido, ``null`` ≠ ``0.0``).
Solo datos sintéticos (títulos "(test)"), ningún paciente.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import replace
from datetime import date
from typing import Any

from app.application.rag_orchestrator_service import ParametrosDeRecuperacion
from app.domain.fusion_de_candidatos import EstrategiaDeFusion
from app.schemas.generated.models import RetrievalMode
from tests.support.generador_falso import FakeEvidenceGenerator
from tests.support.recuperacion import (
    CORPUS_FX06A,
    FICHAS_FX06A,
    PARAMETROS_DE_PRUEBA,
    PUNTAJES_FX06A,
    Q_HER2,
    Q_SIN,
    BuscadorFalso,
    CatalogoFalso,
    ChunkFx,
    EmbedderFalso,
    EmbedderSparseFalso,
    EntornoDeRecuperacion,
    RerankerFalso,
    _ficha,
    _vector,
    crear_entorno,
)

Q_KEYWORD = "¿Qué describe la evidencia sobre la variante PIK3CA E545K en cáncer de mama?"

TERMINO_E545K = 7  # id de token del término léxico "E545K" en el vocabulario del sparse falso
TERMINO_HER2 = 11

# Vectores sparse de las consultas: Q-KEYWORD comparte E545K con ch-m2-1; Q-HER2 comparte HER2 con ch-m1v0-1 (no
# vigente, el primero de la rama) y con ch-m1-1; Q-SIN no comparte ningún término con el corpus.
_SPARSE_DE_LA_PREGUNTA = {
    Q_KEYWORD: {TERMINO_E545K: 1.0},
    Q_HER2: {TERMINO_HER2: 1.0},
    Q_SIN: {99: 1.0},
}

CH_M2_1 = ChunkFx(
    "ch-m2-1",
    "doc-m2",
    "Alpelisib plus fulvestrant improved progression-free survival in PIK3CA E545K-mutated breast cancer.",
    _vector(e5=1.0),  # ortogonal a las consultas de la fixture: el dense lo deja último
    True,
    "mama",
    {TERMINO_E545K: 0.9},
)


def _con_sparse_de_her2(chunk: ChunkFx) -> ChunkFx:
    pesos = {"ch-m1v0-1": 0.95, "ch-m1-1": 0.4}
    if chunk.chunk_id in pesos:
        return replace(chunk, terminos_sparse={TERMINO_HER2: pesos[chunk.chunk_id]})
    return chunk


CORPUS_HIBRIDO: tuple[ChunkFx, ...] = (*(_con_sparse_de_her2(c) for c in CORPUS_FX06A), CH_M2_1)

PUNTAJES_HIBRIDOS = {
    **PUNTAJES_FX06A,
    Q_KEYWORD: {"ch-m2-1": 0.82, "ch-m1-1": 0.20, "ch-p1-1": 0.05, "ch-inj-1": 0.05},
}

FICHAS_HIBRIDAS = {
    **FICHAS_FX06A,
    "doc-m2": _ficha("doc-m2", "Breast Cancer PIK3CA (test)", "CDR-TEST-004", date(2025, 6, 1)),
}

# Con dos candidatos por rama, ch-m2-1 queda fuera del top-k dense (es el último por similitud) pero entra por sparse.
TOP_K_ESTRECHO = 2


def parametros_hibridos(
    *,
    modo: RetrievalMode = RetrievalMode.hibrida,
    fusion: EstrategiaDeFusion = EstrategiaDeFusion.rrf,
    **cambios: Any,
) -> ParametrosDeRecuperacion:
    return replace(
        PARAMETROS_DE_PRUEBA,
        retrieval_top_k=TOP_K_ESTRECHO,
        retrieval_mode=modo,
        retrieval_fusion=fusion,
        **cambios,
    )


class _EmbedderConVectorPropioParaQKeyword(EmbedderFalso):
    """Q-KEYWORD no tiene vector dense en la fixture base: cae en e4, ortogonal a todo el corpus."""

    def embeber(self, texto: str) -> Sequence[float]:
        if texto == Q_KEYWORD:
            self.textos.append(texto)
            return _vector(e4=1.0)
        return super().embeber(texto)


def crear_entorno_hibrido(
    *,
    parametros: ParametrosDeRecuperacion | None = None,
    chunks: Sequence[ChunkFx] = CORPUS_HIBRIDO,
    buscador: Any = None,
    escenario_llm: str = "LLM-OK-M2",
    **bordes: Any,
) -> tuple[EntornoDeRecuperacion, Any, EmbedderSparseFalso]:
    """El servicio real con las dos ramas; devuelve además el buscador y el codificador *sparse* para contar llamadas.

    ``buscador`` permite sustituir el falso por el repositorio de Milvus real (una sola instancia sirve a las dos ramas)."""
    buscador = BuscadorFalso(chunks) if buscador is None else buscador
    codificador = EmbedderSparseFalso(_SPARSE_DE_LA_PREGUNTA)
    entorno = crear_entorno(
        parametros=parametros or parametros_hibridos(),
        embedder=_EmbedderConVectorPropioParaQKeyword(),
        buscador=buscador,
        buscador_sparse=buscador,
        embedder_sparse=codificador,
        reranker=RerankerFalso(PUNTAJES_HIBRIDOS),
        catalogo=CatalogoFalso(FICHAS_HIBRIDAS),
        generador=FakeEvidenceGenerator(escenario_llm),
        **bordes,
    )
    return entorno, buscador, codificador
