"""RETRIEVAL_TOP_K no puede superar RERANKER_MAX_PAIRS con modelos locales (US-231a AC-5, Gate 2).

Si el servicio pasara más candidatos que pares admite el reranker, toda consulta daría 503: el arranque se niega,
nombrando las dos variables y jamás sus valores (distintivos aquí para poder buscarlos en la salida).
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


@pytest.mark.ac("US-231a", 5)
def test_arranque_con_mas_candidatos_que_pares_termina_nombrando_las_dos_variables_sin_valores(
    tmp_path: Path,
) -> None:
    modelos = crear_entorno_de_modelos(tmp_path / "modelos")
    entorno = entorno_de_arranque(
        modelos, RETRIEVAL_TOP_K="4711", RERANKER_MAX_PAIRS="3", RERANK_TOP_N="2"
    )

    proceso = arrancar_en_subproceso(entorno)

    salida = salida_completa(proceso)
    assert proceso.returncode != 0
    assert "RETRIEVAL_TOP_K" in salida and "RERANKER_MAX_PAIRS" in salida
    assert "4711" not in salida


def test_arranque_con_candidatos_dentro_del_maximo_de_pares_no_se_niega_por_esa_causa(
    tmp_path: Path,
) -> None:
    modelos = crear_entorno_de_modelos(tmp_path / "modelos")
    entorno = entorno_de_arranque(modelos, RETRIEVAL_TOP_K="12", RERANKER_MAX_PAIRS="12")

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
