"""Contrato del puerto ``AlmacenDeReindexacionDeContexto`` (US-279 D4, LSP): el fake en memoria y Milvus real lo cumplen igual.

Paginado de TODOS los chunks sin repetir ni omitir (más de 2 páginas), ``lote`` fuera de rango, ids presentes y escritura de la fila
completa en OTRA colección. El caso ``milvus`` solo corre donde existe el Milvus de test del Compose (``servicios_reales``).
"""

from __future__ import annotations

from collections.abc import Callable

import pytest
from pymilvus import MilvusClient

from app.application.corpus_ingestion.ports import AlmacenDeReindexacionDeContexto
from app.config.settings import MilvusSettings
from app.infrastructure.milvus.repository import LIMITE_DE_CONSULTA, MilvusRepository
from tests.support.almacenes_falsos import AlmacenDeChunksEnMemoria
from tests.support.milvus import (
    DIMENSION_DE_TEST,
    ajustes_de_milvus,
    chunk_sintetico,
    vector_unitario,
)

VIGENTES = 25
NO_VIGENTES = 3
LOTE = 10  # 28 chunks en 3 páginas (10 + 10 + 8)


def _dense(indice: int) -> list[float]:
    return vector_unitario(DIMENSION_DE_TEST, indice % DIMENSION_DE_TEST)


def _chunks() -> list:
    return [
        chunk_sintetico(f"v{i:03d}", _dense(i), sparse={i + 1: 0.5}) for i in range(VIGENTES)
    ] + [
        chunk_sintetico(f"n{i:03d}", _dense(i), sparse={i + 1: 0.25}, vigente=False)
        for i in range(NO_VIGENTES)
    ]


@pytest.fixture(params=["memoria", pytest.param("milvus", marks=pytest.mark.servicios_reales)])
def fabrica_de_almacen(
    request: pytest.FixtureRequest,
) -> Callable[[], AlmacenDeReindexacionDeContexto]:
    """Una fábrica de almacenes vacíos del mismo tipo: el origen y el destino de una reindexación."""
    if request.param == "memoria":
        return lambda: AlmacenDeChunksEnMemoria()  # type: ignore[return-value]
    cliente: MilvusClient = request.getfixturevalue("cliente_milvus")
    uri: str = request.getfixturevalue("uri_de_milvus")
    nueva: Callable[[], str] = request.getfixturevalue("nueva_coleccion")

    def fabricar() -> AlmacenDeReindexacionDeContexto:
        ajustes: MilvusSettings = ajustes_de_milvus(uri, nueva())
        almacen = MilvusRepository(cliente, ajustes)
        almacen.ensure_collection()
        return almacen

    return fabricar


@pytest.fixture
def origen(
    fabrica_de_almacen: Callable[[], AlmacenDeReindexacionDeContexto],
) -> AlmacenDeReindexacionDeContexto:
    almacen = fabrica_de_almacen()
    almacen.upsert_chunks(_chunks())  # type: ignore[attr-defined]
    return almacen


def test_pagina_todos_los_chunks_vigentes_o_no_exactamente_una_vez(
    origen: AlmacenDeReindexacionDeContexto,
) -> None:
    paginas = list(origen.listar_paginado(LOTE))

    ids = [chunk.chunk_id for pagina in paginas for chunk in pagina]
    assert [len(p) for p in paginas] == [10, 10, 8]
    esperados = sorted(c.chunk_id for c in _chunks())
    assert sorted(ids) == esperados and len(set(ids)) == len(esperados)
    assert {c.chunk_id for p in paginas for c in p if not c.is_current} == {
        f"n{i:03d}" for i in range(NO_VIGENTES)
    }


def test_cada_chunk_lleva_los_campos_de_decision(origen: AlmacenDeReindexacionDeContexto) -> None:
    chunks = {c.chunk_id: c for p in origen.listar_paginado(LOTE) for c in p}

    chunk = chunks["v003"]
    assert (chunk.document_id, chunk.chunk_index, chunk.section) == ("doc-v003", 0, "resultados")
    assert chunk.chunk_text == "Texto sintético del chunk v003." and chunk.is_current


@pytest.mark.parametrize("lote", [0, -1, LIMITE_DE_CONSULTA, LIMITE_DE_CONSULTA + 1])
def test_rechaza_un_lote_fuera_de_rango_antes_de_leer(
    origen: AlmacenDeReindexacionDeContexto, lote: int
) -> None:
    with pytest.raises(ValueError):
        origen.listar_paginado(lote)


def test_ids_presentes_devuelve_solo_los_que_la_coleccion_tiene(
    origen: AlmacenDeReindexacionDeContexto,
) -> None:
    assert origen.ids_presentes(["v001", "n000", "no-existe"]) == frozenset({"v001", "n000"})
    assert origen.ids_presentes([]) == frozenset()


def test_la_fila_completa_leida_de_un_almacen_se_escribe_tal_cual_en_otro(
    fabrica_de_almacen: Callable[[], AlmacenDeReindexacionDeContexto],
    origen: AlmacenDeReindexacionDeContexto,
) -> None:
    destino = fabrica_de_almacen()
    filas = [dict(c.registro) for p in origen.listar_paginado(LOTE) for c in p]

    escritas = destino.escribir_filas(filas)

    assert escritas == VIGENTES + NO_VIGENTES
    leidos = {c.chunk_id: c for p in destino.listar_paginado(LOTE) for c in p}
    originales = {c.chunk_id: c for p in origen.listar_paginado(LOTE) for c in p}
    assert set(leidos) == set(originales)
    for chunk_id, chunk in leidos.items():
        assert chunk.chunk_text == originales[chunk_id].chunk_text
        assert chunk.is_current == originales[chunk_id].is_current
        assert list(chunk.registro["dense_vector"]) == pytest.approx(
            list(originales[chunk_id].registro["dense_vector"])
        )
        assert dict(chunk.registro["sparse_vector"]) == pytest.approx(
            dict(originales[chunk_id].registro["sparse_vector"])
        )
    assert destino.escribir_filas([]) == 0
