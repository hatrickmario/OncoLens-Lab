"""RETRIEVAL_TOP_K puede superar RERANKER_MAX_PAIRS: el servicio recorta antes del reranker (decisión 82, 2026-10-17).

El adapter real y el falso conservan su límite duro de pares (más pares es ``FalloDeInferencia``).
"""

from __future__ import annotations

from pathlib import Path

import pytest

from app.application.ports import ChunkEncontrado, FalloDeInferencia
from tests.support.modelos import (
    arrancar_en_subproceso,
    crear_entorno_de_modelos,
    entorno_de_arranque,
    salida_completa,
)
from tests.support.recuperacion import Q_HER2, RerankerFalso


def test_arranque_con_mas_candidatos_que_pares_no_se_niega_porque_el_corte_previo_los_recorta(
    tmp_path: Path,
) -> None:
    modelos = crear_entorno_de_modelos(tmp_path / "modelos")
    entorno = entorno_de_arranque(modelos, RETRIEVAL_TOP_K="30", RERANKER_MAX_PAIRS="12")

    salida = salida_completa(arrancar_en_subproceso(entorno))

    assert "RERANKER_MAX_PAIRS" not in salida


def test_el_reranker_falso_lanza_el_error_del_puerto_con_mas_pares_que_su_maximo() -> None:
    candidatos = [
        ChunkEncontrado(chunk_id=f"c{i}", document_id="d", chunk_text="t", similitud_dense=0.1)
        for i in range(3)
    ]

    with pytest.raises(FalloDeInferencia):
        RerankerFalso(max_pairs=2).puntuar(Q_HER2, candidatos)

    assert len(RerankerFalso(max_pairs=3).puntuar(Q_HER2, candidatos)) == 3
