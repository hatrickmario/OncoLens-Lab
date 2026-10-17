"""Consulta por documento y apagado de vigencia en Milvus real (US-059, RN-05): solo chunks sintéticos con dim=8."""

from __future__ import annotations

import pytest
from pymilvus import MilvusClient

from app.application.ports import DimensionDeVectorInvalida
from app.config.settings import MilvusSettings
from app.infrastructure.milvus.repository import MilvusRepository
from tests.support.milvus import chunk_sintetico, vector_unitario

pytestmark = pytest.mark.servicios_reales

DIMENSION = 8


@pytest.fixture
def repositorio(cliente_milvus: MilvusClient, ajustes_milvus: MilvusSettings) -> MilvusRepository:
    repositorio = MilvusRepository(cliente_milvus, ajustes_milvus)
    repositorio.ensure_collection()
    return repositorio


def test_marcar_no_vigentes_apaga_los_chunks_del_documento_sin_borrarlos_ni_tocar_a_los_demas(
    repositorio: MilvusRepository, cliente_milvus: MilvusClient, ajustes_milvus: MilvusSettings
) -> None:
    repositorio.insert_chunks(
        [
            chunk_sintetico("a", vector_unitario(DIMENSION, 0)),
            chunk_sintetico("b", vector_unitario(DIMENSION, 1)),
        ]
    )

    cambiados = repositorio.marcar_no_vigentes("doc-a")

    filas = cliente_milvus.query(
        ajustes_milvus.milvus_collection_name,
        filter="chunk_id in ['a', 'b']",
        output_fields=["chunk_id", "is_current", "chunk_text", "dense_vector"],
        consistency_level="Strong",
    )
    por_id = {f["chunk_id"]: f for f in filas}
    assert cambiados == 1
    assert (por_id["a"]["is_current"], por_id["b"]["is_current"]) == (False, True)
    assert por_id["a"]["chunk_text"] == "Texto sintético del chunk a."
    assert list(por_id["a"]["dense_vector"]) == vector_unitario(DIMENSION, 0)


def test_marcar_no_vigentes_repetido_no_cambia_nada_y_no_duplica_entidades(
    repositorio: MilvusRepository, cliente_milvus: MilvusClient, ajustes_milvus: MilvusSettings
) -> None:
    repositorio.insert_chunks([chunk_sintetico("a", vector_unitario(DIMENSION, 0))])
    repositorio.marcar_no_vigentes("doc-a")

    assert repositorio.marcar_no_vigentes("doc-a") == 0
    filas = cliente_milvus.query(
        ajustes_milvus.milvus_collection_name,
        filter="document_id == 'doc-a'",
        output_fields=["chunk_id"],
        consistency_level="Strong",
    )
    assert [f["chunk_id"] for f in filas] == ["a"]


@pytest.mark.parametrize("identificador", ['x" or true or "', "con\\barra"])
def test_un_document_id_con_comilla_o_barra_se_rechaza_antes_de_consultar_o_reescribir(
    repositorio: MilvusRepository, identificador: str
) -> None:
    with pytest.raises(ValueError, match="comillas"):
        repositorio.marcar_no_vigentes(identificador)


def test_upsert_chunks_es_idempotente_y_deja_vigente_un_chunk_apagado(
    repositorio: MilvusRepository, cliente_milvus: MilvusClient, ajustes_milvus: MilvusSettings
) -> None:
    chunk = chunk_sintetico("a", vector_unitario(DIMENSION, 0))
    repositorio.upsert_chunks([chunk])
    repositorio.upsert_chunks([chunk])
    repositorio.marcar_no_vigentes("doc-a")

    repositorio.upsert_chunks([chunk])

    filas = cliente_milvus.query(
        ajustes_milvus.milvus_collection_name,
        filter="chunk_id == 'a'",
        output_fields=["chunk_id", "is_current"],
        consistency_level="Strong",
    )
    assert [(f["chunk_id"], f["is_current"]) for f in filas] == [("a", True)]


def test_upsert_chunks_con_otra_dimension_lanza_dimension_de_vector_invalida(
    repositorio: MilvusRepository,
) -> None:
    with pytest.raises(DimensionDeVectorInvalida):
        repositorio.upsert_chunks([chunk_sintetico("a", vector_unitario(16, 0))])


def test_upsert_chunks_devuelve_cuantos_chunks_escribio(repositorio: MilvusRepository) -> None:
    chunks = [chunk_sintetico(f"c{i}", vector_unitario(DIMENSION, i)) for i in range(3)]

    assert repositorio.upsert_chunks(chunks) == 3
    assert repositorio.upsert_chunks(chunks[:2]) == 2
