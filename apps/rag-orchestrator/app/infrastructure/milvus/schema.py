"""Esquema esperado de la colección ``corpus_chunks`` (data-model §4.7, US-058): único lugar donde se define.

Lo usan ``MilvusRepository`` (crear y comparar) y los tests (describir). La dimensión del vector dense, el índice y
su métrica vienen de configuración (ADR-39, RN-22); aquí no hay ningún valor fijo de ADR-39.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from pymilvus import CollectionSchema, DataType, MilvusClient

from app.config.settings import MilvusSettings

CAMPO_DENSE = "dense_vector"
CAMPO_SPARSE = "sparse_vector"
CAMPOS_ESCALARES_INDEXADOS = ("is_current", "cancer_type_tags")
# Parámetro de búsqueda de HNSW que ADR-39 guarda junto a los de construcción en VECTOR_INDEX_PARAMS.
PARAMETROS_DE_BUSQUEDA = frozenset({"ef"})


@dataclass(frozen=True)
class CampoEsperado:
    nombre: str
    tipo: DataType
    dimension: int | None = None


def campos_esperados(ajustes: MilvusSettings) -> list[CampoEsperado]:
    """Nombre, tipo y dimensión de cada campo, en el orden de §4.7."""
    return [
        CampoEsperado("chunk_id", DataType.VARCHAR),
        CampoEsperado("document_id", DataType.VARCHAR),
        CampoEsperado(CAMPO_DENSE, DataType.FLOAT_VECTOR, ajustes.embedding_dim),
        CampoEsperado(CAMPO_SPARSE, DataType.SPARSE_FLOAT_VECTOR),
        CampoEsperado("chunk_text", DataType.VARCHAR),
        CampoEsperado("chunk_index", DataType.INT64),
        CampoEsperado("section", DataType.VARCHAR),
        CampoEsperado("source_type", DataType.VARCHAR),
        CampoEsperado("language", DataType.VARCHAR),
        CampoEsperado("cancer_type_tags", DataType.VARCHAR),
        CampoEsperado("population", DataType.VARCHAR),
        CampoEsperado("study_design", DataType.VARCHAR),
        CampoEsperado("published_year", DataType.INT64),
        CampoEsperado("is_current", DataType.BOOL),
        CampoEsperado("created_at", DataType.INT64),
    ]


def build_corpus_chunks_schema(ajustes: MilvusSettings) -> CollectionSchema:
    """``CollectionSchema`` de ``corpus_chunks``: ``created_at`` es época en ms (Milvus no tiene tipo fecha)."""
    esquema = MilvusClient.create_schema(auto_id=False, enable_dynamic_field=False)
    esquema.add_field(
        "chunk_id", DataType.VARCHAR, is_primary=True, max_length=ajustes.milvus_len_chunk_id
    )
    esquema.add_field("document_id", DataType.VARCHAR, max_length=ajustes.milvus_len_document_id)
    esquema.add_field(CAMPO_DENSE, DataType.FLOAT_VECTOR, dim=ajustes.embedding_dim)
    esquema.add_field(CAMPO_SPARSE, DataType.SPARSE_FLOAT_VECTOR)
    esquema.add_field("chunk_text", DataType.VARCHAR, max_length=ajustes.milvus_len_chunk_text)
    esquema.add_field("chunk_index", DataType.INT64)
    esquema.add_field("section", DataType.VARCHAR, max_length=ajustes.milvus_len_section)
    esquema.add_field("source_type", DataType.VARCHAR, max_length=ajustes.milvus_len_source_type)
    esquema.add_field("language", DataType.VARCHAR, max_length=ajustes.milvus_len_language)
    esquema.add_field(
        "cancer_type_tags", DataType.VARCHAR, max_length=ajustes.milvus_len_cancer_type_tags
    )
    esquema.add_field("population", DataType.VARCHAR, max_length=ajustes.milvus_len_population)
    esquema.add_field("study_design", DataType.VARCHAR, max_length=ajustes.milvus_len_study_design)
    esquema.add_field("published_year", DataType.INT64)
    esquema.add_field("is_current", DataType.BOOL)
    esquema.add_field("created_at", DataType.INT64)
    return esquema


# Parámetros de construcción de HNSW que ADR-39 guarda en VECTOR_INDEX_PARAMS (lista de permitidos).
PARAMETROS_DE_CONSTRUCCION_HNSW = ("M", "efConstruction")


def parametros_de_construccion(tipo: str, plano: dict[str, Any]) -> dict[str, Any]:
    """``VECTOR_INDEX_PARAMS`` plano → parámetros de construcción del índice. ``FLAT`` no lleva ninguno."""
    if tipo != "HNSW":
        return {}
    return {k: plano[k] for k in PARAMETROS_DE_CONSTRUCCION_HNSW if k in plano}


def parametros_de_busqueda(tipo: str, plano: dict[str, Any]) -> dict[str, Any]:
    """``VECTOR_INDEX_PARAMS`` plano → parámetros de búsqueda (``ef`` en HNSW). ``FLAT`` no lleva ninguno."""
    if tipo != "HNSW":
        return {}
    return {k: plano[k] for k in PARAMETROS_DE_BUSQUEDA if k in plano}


def search_params(ajustes: MilvusSettings) -> dict[str, Any]:
    return {
        "metric_type": ajustes.milvus_dense_metric_type,
        "params": parametros_de_busqueda(ajustes.vector_index_type, ajustes.vector_index_params),
    }


def search_params_sparse(ajustes: MilvusSettings) -> dict[str, Any]:
    """Búsqueda *sparse*: la métrica del índice declarado en ``build_corpus_chunks_indexes`` (RN-22)."""
    return {"metric_type": ajustes.milvus_sparse_metric_type, "params": {}}


def build_corpus_chunks_indexes(cliente: MilvusClient, ajustes: MilvusSettings) -> Any:
    """Índices dense, sparse y escalares. Milvus exige índice en cada vector para cargar la colección."""
    indices = cliente.prepare_index_params()
    indices.add_index(
        field_name=CAMPO_DENSE,
        index_type=ajustes.vector_index_type,
        metric_type=ajustes.milvus_dense_metric_type,
        params=parametros_de_construccion(ajustes.vector_index_type, ajustes.vector_index_params),
    )
    indices.add_index(
        field_name=CAMPO_SPARSE,
        index_type=ajustes.milvus_sparse_index_type,
        metric_type=ajustes.milvus_sparse_metric_type,
    )
    for campo in CAMPOS_ESCALARES_INDEXADOS:
        indices.add_index(field_name=campo, index_type="INVERTED")
    return indices
