"""Reranker real con puntaje normalizado a [0,1] (US-231a AC-2, RN-03, ADR-39).

La ruta rápida usa la sesión de inferencia falsa; la del modelo real lleva el marcador ``models``.
"""

from __future__ import annotations

import pytest

from app.application.ports import ChunkEncontrado, Reranker
from app.infrastructure.reranker.bge_reranker import BgeReranker
from tests.support.inferencia_falsa import (
    PASAJES_FX06AC,
    Q_HER2,
    SesionDeLogitsFalsa,
    TokenizadorFalso,
)


def _candidatos() -> list[ChunkEncontrado]:
    return [
        ChunkEncontrado(
            chunk_id=id_, document_id=f"doc-{id_}", chunk_text=texto, similitud_dense=0.5
        )
        for id_, texto in PASAJES_FX06AC.items()
    ]


def _afirmar_unidad_y_pertinente_sobre_otro_tipo(reranker: Reranker) -> None:
    puntajes = dict(zip(PASAJES_FX06AC, reranker.puntuar(Q_HER2, _candidatos())))

    assert all(0.0 <= p <= 1.0 for p in puntajes.values())
    assert puntajes["ch-m1-1"] > puntajes["ch-p1-1"]


@pytest.mark.ac("US-231a", 2)
def test_puntua_en_0_1_y_ch_m1_1_por_encima_de_ch_p1_1_con_sesion_falsa() -> None:
    reranker = BgeReranker(
        SesionDeLogitsFalsa(),
        TokenizadorFalso(),
        version="reranker-test@rev#sha256:abc",
        max_length=512,
        max_pairs=12,
        max_tokens_por_lote=4096,
    )

    _afirmar_unidad_y_pertinente_sobre_otro_tipo(reranker)


@pytest.mark.models
@pytest.mark.ac("US-231a", 2)
def test_puntua_en_0_1_y_ch_m1_1_por_encima_de_ch_p1_1_con_los_pesos_reales() -> None:
    from tests.support.modelos import cargar_modelos_reales

    _afirmar_unidad_y_pertinente_sobre_otro_tipo(cargar_modelos_reales().reranker)
