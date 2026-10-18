"""Cálculo del ``relevance_score`` en un proceso aparte (US-231a AC-6): imprime los puntajes con toda su precisión.

``python -m tests.support.determinismo`` usa la sesión de inferencia falsa; con ``--real`` carga los pesos de
``MODEL_CACHE_DIR`` (rutas y SHA-256 del entorno, como en el arranque).
"""

from __future__ import annotations

import json
import sys

from app.application.ports import ChunkEncontrado, Reranker
from app.infrastructure.reranker.bge_reranker import BgeReranker
from tests.support.inferencia_falsa import (
    PASAJES_FX06AC,
    Q_HER2,
    SesionDeLogitsFalsa,
    TokenizadorFalso,
)


def _reranker(real: bool) -> Reranker:
    if real:
        from tests.support.modelos import cargar_modelos_reales

        return cargar_modelos_reales().reranker
    return BgeReranker(
        SesionDeLogitsFalsa(),
        TokenizadorFalso(),
        version="reranker-test@rev#sha256:abc",
        max_length=512,
        max_pairs=12,
        max_tokens_por_lote=4096,
    )


def puntajes(real: bool) -> list[float]:
    candidatos = [
        ChunkEncontrado(chunk_id=i, document_id=f"doc-{i}", chunk_text=t, similitud_dense=0.5)
        for i, t in PASAJES_FX06AC.items()
    ]
    return _reranker(real).puntuar(Q_HER2, candidatos)


if __name__ == "__main__":
    print(json.dumps([repr(p) for p in puntajes("--real" in sys.argv)]))
