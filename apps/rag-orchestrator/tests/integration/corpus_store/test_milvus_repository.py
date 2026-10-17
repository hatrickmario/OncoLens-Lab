"""Colección ``corpus_chunks`` en un Milvus real de test (US-058 AC-1, AC-2, AC-3 y AC-5).

Test después (inicializador y configuración). Milvus es real: lo verificado es el propio esquema. Cada test usa una
colección temporal ``corpus_test_*``; nunca ``corpus_chunks``. Solo chunks sintéticos con ``EMBEDDING_DIM=8`` (FX-06c-a).
"""

from __future__ import annotations

from collections.abc import Callable

import pytest
from pymilvus import DataType, MilvusClient

from app.application.ports import DimensionDeVectorInvalida
from app.config.settings import MilvusSettings
from app.infrastructure.milvus.repository import CorpusCollectionSchemaMismatch, MilvusRepository
from tests.support.milvus import ajustes_de_milvus, chunk_sintetico, vector_unitario

pytestmark = pytest.mark.servicios_reales

DIMENSION = 8
DENORMALIZADOS = (
    "source_type",
    "language",
    "cancer_type_tags",
    "population",
    "study_design",
    "published_year",
    "is_current",
)
RESTO_DE_CAMPOS = ("chunk_id", "document_id", "chunk_text", "chunk_index", "section", "created_at")


def contar(cliente: MilvusClient, coleccion: str) -> int:
    cliente.flush(coleccion)
    return int(cliente.get_collection_stats(coleccion)["row_count"])


def identificador_interno(cliente: MilvusClient, coleccion: str) -> int:
    return int(cliente.describe_collection(coleccion)["collection_id"])


@pytest.fixture
def repositorio(cliente_milvus: MilvusClient, ajustes_milvus: MilvusSettings) -> MilvusRepository:
    return MilvusRepository(cliente_milvus, ajustes_milvus)


@pytest.mark.ac("US-058", 1)
def test_milvus_repository_coleccion_nueva_tiene_vectores_y_campos_denormalizados(
    repositorio: MilvusRepository, cliente_milvus: MilvusClient, ajustes_milvus: MilvusSettings
) -> None:
    creada = repositorio.ensure_collection()

    descripcion = cliente_milvus.describe_collection(ajustes_milvus.milvus_collection_name)
    campos = {campo["name"]: campo for campo in descripcion["fields"]}
    assert creada is True
    assert campos["dense_vector"]["type"] == DataType.FLOAT_VECTOR
    assert campos["sparse_vector"]["type"] == DataType.SPARSE_FLOAT_VECTOR
    assert set(DENORMALIZADOS + RESTO_DE_CAMPOS) <= set(campos)
    assert campos["is_current"]["type"] == DataType.BOOL
    assert campos["created_at"]["type"] == DataType.INT64  # época en ms: Milvus no tiene tipo fecha
    indices = {
        nombre: cliente_milvus.describe_index(ajustes_milvus.milvus_collection_name, nombre)
        for nombre in cliente_milvus.list_indexes(ajustes_milvus.milvus_collection_name)
    }
    assert {"dense_vector", "sparse_vector", "is_current", "cancer_type_tags"} <= set(indices)
    assert indices["is_current"]["index_type"] == "INVERTED"
    assert indices["cancer_type_tags"]["index_type"] == "INVERTED"
    assert (
        indices["dense_vector"]["index_type"] == ajustes_milvus.vector_index_type
    )  # de ADR-39, no del código


@pytest.mark.ac("US-058", 2)
def test_milvus_repository_dimension_8_rechaza_vector_de_1024(
    repositorio: MilvusRepository, cliente_milvus: MilvusClient, ajustes_milvus: MilvusSettings
) -> None:
    repositorio.ensure_collection()
    nombre = ajustes_milvus.milvus_collection_name

    insertados = repositorio.insert_chunks([chunk_sintetico("c1", vector_unitario(DIMENSION, 0))])
    with pytest.raises(DimensionDeVectorInvalida):
        repositorio.insert_chunks([chunk_sintetico("c2", vector_unitario(1024, 0))])

    dimension = next(
        c["params"]["dim"]
        for c in cliente_milvus.describe_collection(nombre)["fields"]
        if c["name"] == "dense_vector"
    )
    assert (dimension, insertados, contar(cliente_milvus, nombre)) == (DIMENSION, 1, 1)


@pytest.mark.ac("US-058", 3)
def test_milvus_repository_chunk_sin_sparse_se_inserta_y_recupera_por_dense(
    repositorio: MilvusRepository, cliente_milvus: MilvusClient, ajustes_milvus: MilvusSettings
) -> None:
    # La versión fijada de Milvus (v2.6.x del Compose de L1D-164) acepta el sparse vacío: no se aplica el fallback de
    # D4 (sparse del adapter de embeddings) y el esquema no cambia. Si una versión futura lo rechazara, este test
    # fallaría en la inserción y el fallback se aplicaría en el repositorio; no se salta ni se marca como xfail.
    repositorio.ensure_collection()

    insertados = repositorio.insert_chunks(
        [
            chunk_sintetico("vigente", vector_unitario(DIMENSION, 0), sparse=None),
            chunk_sintetico("historico", vector_unitario(DIMENSION, 0), vigente=False),
            chunk_sintetico("ortogonal", vector_unitario(DIMENSION, 1)),
        ]
    )
    contar(
        cliente_milvus, ajustes_milvus.milvus_collection_name
    )  # flush: la consistencia por defecto es Bounded
    encontrados = repositorio.search_dense(vector_unitario(DIMENSION, 0), limit=5)

    assert insertados == 3
    assert [chunk.chunk_id for chunk in encontrados] == [
        "vigente",
        "ortogonal",
    ]  # is_current == true (RN-05)
    assert encontrados[0].similitud_dense > encontrados[1].similitud_dense  # idéntico > ortogonal
    assert encontrados[0].document_id == "doc-vigente"


@pytest.mark.ac("US-058", 5)
def test_milvus_repository_reejecutar_el_inicializador_no_cambia_el_identificador_ni_el_conteo(
    repositorio: MilvusRepository, cliente_milvus: MilvusClient, ajustes_milvus: MilvusSettings
) -> None:
    nombre = ajustes_milvus.milvus_collection_name
    repositorio.ensure_collection()
    repositorio.insert_chunks(
        [chunk_sintetico(f"c{i}", vector_unitario(DIMENSION, i)) for i in range(3)]
    )
    antes = (identificador_interno(cliente_milvus, nombre), contar(cliente_milvus, nombre))

    creada = repositorio.ensure_collection()

    assert creada is False
    assert (
        (identificador_interno(cliente_milvus, nombre), contar(cliente_milvus, nombre))
        == antes
        == (antes[0], 3)
    )


@pytest.mark.ac("US-058", 5)
def test_milvus_repository_otra_dimension_falla_nombrando_dense_vector_16_y_8_sin_tocar_la_coleccion(
    repositorio: MilvusRepository,
    cliente_milvus: MilvusClient,
    ajustes_milvus: MilvusSettings,
    uri_de_milvus: str,
) -> None:
    nombre = ajustes_milvus.milvus_collection_name
    repositorio.ensure_collection()
    repositorio.insert_chunks(
        [chunk_sintetico(f"c{i}", vector_unitario(DIMENSION, i)) for i in range(3)]
    )
    antes = (identificador_interno(cliente_milvus, nombre), contar(cliente_milvus, nombre))
    con_dimension_16 = MilvusRepository(
        cliente_milvus, ajustes_de_milvus(uri_de_milvus, nombre, dimension=16)
    )

    with pytest.raises(CorpusCollectionSchemaMismatch) as error:
        con_dimension_16.ensure_collection()

    assert (error.value.campo, error.value.esperado, error.value.encontrado) == (
        "dense_vector",
        "16",
        "8",
    )
    assert (identificador_interno(cliente_milvus, nombre), contar(cliente_milvus, nombre)) == antes


def test_milvus_repository_un_campo_ajeno_al_esquema_se_informa_por_nombre(
    cliente_milvus: MilvusClient, nueva_coleccion: Callable[[], str], uri_de_milvus: str
) -> None:
    ajena = nueva_coleccion()
    esquema = MilvusClient.create_schema(auto_id=False, enable_dynamic_field=False)
    esquema.add_field("chunk_id", DataType.VARCHAR, is_primary=True, max_length=16)
    esquema.add_field("dense_vector", DataType.FLOAT_VECTOR, dim=DIMENSION)
    indices = cliente_milvus.prepare_index_params()
    indices.add_index("dense_vector", index_type="FLAT", metric_type="COSINE")
    cliente_milvus.create_collection(ajena, schema=esquema, index_params=indices)

    with pytest.raises(CorpusCollectionSchemaMismatch) as error:
        MilvusRepository(
            cliente_milvus, ajustes_de_milvus(uri_de_milvus, ajena)
        ).ensure_collection()

    assert error.value.campo == "document_id"
    assert contar(cliente_milvus, ajena) == 0


@pytest.mark.ac("US-058", 5)
@pytest.mark.parametrize(
    ("campo", "esperado", "encontrado", "otros_ajustes"),
    [
        ("dense_vector.metric_type", "COSINE", "IP", {"metrica": "IP"}),
        ("dense_vector.index_type", "FLAT", "HNSW", {"tipo_de_indice": "HNSW"}),
    ],
    ids=["metrica", "tipo_de_indice"],
)
def test_milvus_repository_metrica_o_indice_distintos_lanza_schema_mismatch(
    cliente_milvus: MilvusClient,
    nueva_coleccion: Callable[[], str],
    uri_de_milvus: str,
    campo: str,
    esperado: str,
    encontrado: str,
    otros_ajustes: dict[str, str],
) -> None:
    nombre = nueva_coleccion()
    existente = MilvusRepository(
        cliente_milvus, ajustes_de_milvus(uri_de_milvus, nombre, **otros_ajustes)  # type: ignore[arg-type]
    )
    existente.ensure_collection()
    antes = identificador_interno(cliente_milvus, nombre)
    configuracion = (
        ajustes_de_milvus(uri_de_milvus, nombre)
        if esperado == "COSINE"
        else ajustes_de_milvus(uri_de_milvus, nombre, tipo_de_indice="FLAT")
    )

    with pytest.raises(CorpusCollectionSchemaMismatch) as error:
        MilvusRepository(cliente_milvus, configuracion).ensure_collection()

    assert (error.value.campo, error.value.esperado, error.value.encontrado) == (
        campo,
        esperado,
        encontrado,
    )
    assert identificador_interno(cliente_milvus, nombre) == antes
