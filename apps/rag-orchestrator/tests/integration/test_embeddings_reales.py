"""Embeddings reales de consulta y de pasaje con BGE-M3 (US-231a AC-1, IA-01, ADR-39).

La ruta rápida de la CI usa la sesión de inferencia falsa (sin pesos, RN-14); la del modelo real lleva el marcador
``models`` y corre en la VM local con los pesos de ``MODEL_CACHE_DIR``.
"""

from __future__ import annotations

import pytest

from app.application.ports import QueryEmbedder
from app.application.seed_corpus.ports import PassageEmbedder
from app.infrastructure.embeddings.bge_m3 import (
    EmbedderDeConsultaBgeM3,
    EmbedderDePasajesBgeM3,
    NucleoBgeM3,
)
from tests.support.inferencia_falsa import (
    PASAJES_FX06AC,
    Q_HER2,
    SesionDeEmbeddingsFalsa,
    TokenizadorFalso,
    coseno,
)

DIMENSION = 1024  # EMBEDDING_DIM (ADR-39)


def _afirmar_dimension_y_orden_por_coseno(
    consulta: QueryEmbedder, pasajes: PassageEmbedder, dimension: int
) -> None:
    vector_pregunta = consulta.embeber(Q_HER2)
    vectores = dict(zip(PASAJES_FX06AC, pasajes.embeber(list(PASAJES_FX06AC.values()))))

    assert len(vector_pregunta) == dimension
    assert all(len(v) == dimension for v in vectores.values())
    por_coseno = sorted(
        vectores, key=lambda id_: coseno(vector_pregunta, vectores[id_]), reverse=True
    )
    assert por_coseno[0] == "ch-m1-1"


@pytest.mark.ac("US-231a", 1)
def test_vectores_de_1024_dimensiones_y_ch_m1_1_primero_por_coseno_con_sesion_falsa() -> None:
    nucleo = NucleoBgeM3(
        SesionDeEmbeddingsFalsa(DIMENSION),
        TokenizadorFalso(),
        modelo="BAAI/bge-m3@rev-test",
        dimension=DIMENSION,
        max_length=8192,
        max_tokens_por_lote=4096,
    )

    _afirmar_dimension_y_orden_por_coseno(
        EmbedderDeConsultaBgeM3(nucleo), EmbedderDePasajesBgeM3(nucleo), DIMENSION
    )


@pytest.mark.models
@pytest.mark.ac("US-231a", 1)
def test_vectores_de_1024_dimensiones_y_ch_m1_1_primero_por_coseno_con_los_pesos_reales() -> None:
    from tests.support.modelos import cargar_modelos_reales

    modelos = cargar_modelos_reales()

    _afirmar_dimension_y_orden_por_coseno(
        modelos.embedder_consulta, modelos.embedder_pasajes, DIMENSION
    )
