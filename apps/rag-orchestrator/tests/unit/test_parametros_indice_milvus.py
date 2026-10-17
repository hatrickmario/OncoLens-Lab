"""Reparto de ``VECTOR_INDEX_PARAMS`` (ADR-39) entre construcción y búsqueda: una sola regla para el adapter y T5."""

from __future__ import annotations

from app.infrastructure.milvus.schema import parametros_de_busqueda, parametros_de_construccion

ADR39 = {"M": 16, "efConstruction": 200, "ef": 64}


def test_parametros_de_hnsw_separan_construccion_y_busqueda_segun_adr39() -> None:
    assert parametros_de_construccion("HNSW", ADR39) == {"M": 16, "efConstruction": 200}
    assert parametros_de_busqueda("HNSW", ADR39) == {"ef": 64}


def test_parametros_de_flat_son_vacios_aunque_la_configuracion_traiga_los_de_hnsw() -> None:
    assert parametros_de_construccion("FLAT", {"M": 16, "ef": 64}) == {}
    assert parametros_de_busqueda("FLAT", {"M": 16, "ef": 64}) == {}


def test_parametros_de_hnsw_ignoran_claves_que_adr39_no_permite() -> None:
    assert parametros_de_construccion("HNSW", {"M": 8, "desconocido": 1}) == {"M": 8}
