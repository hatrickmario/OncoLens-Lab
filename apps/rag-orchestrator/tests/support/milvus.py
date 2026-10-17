"""Arnés de Milvus real de test (US-058): colecciones temporales con prefijo propio y chunks sintéticos (FX-06c-a).

Nunca crea ni elimina ``corpus_chunks`` ni ninguna colección ajena al prefijo: el nombre se valida antes de cada
operación. El sufijo lo inyecta quien llama.
"""

from __future__ import annotations

import re
from typing import Any

from pymilvus import MilvusClient

from app.application.ports import ChunkDelCorpus
from app.config.settings import MilvusSettings

PREFIJO_COLECCION_DE_TEST = "corpus_test_"
COLECCION_DE_PRODUCCION = "corpus_chunks"
_PATRON_NOMBRE = re.compile(r"corpus_test_[a-z0-9_]{3,}")
INDICE_DE_ADR39: dict[str, Any] = {
    "M": 16,
    "efConstruction": 200,
    "ef": 64,
}  # VECTOR_INDEX_PARAMS de ADR-39
DIMENSION_DE_TEST = 8  # FX-06c-a: los tests usan EMBEDDING_DIM=8 con vectores sintéticos
EPOCA_FIJA_MS = 1_760_000_000_000  # reloj congelado: 2025-10-09T08:53:20Z


class ColeccionProhibida(RuntimeError):
    """El arnés solo toca colecciones ``corpus_test_*``, nunca ``corpus_chunks``."""


def nombre_de_coleccion_de_test(sufijo: str) -> str:
    nombre = f"{PREFIJO_COLECCION_DE_TEST}{sufijo}"
    verificar_coleccion_de_test(nombre)
    return nombre


def verificar_coleccion_de_test(nombre: str) -> None:
    if nombre == COLECCION_DE_PRODUCCION or not _PATRON_NOMBRE.fullmatch(nombre):
        raise ColeccionProhibida(
            f"{nombre!r}: el arnés solo usa colecciones {PREFIJO_COLECCION_DE_TEST}*"
        )


def ajustes_de_milvus(
    uri: str, nombre: str, *, dimension: int = DIMENSION_DE_TEST
) -> MilvusSettings:
    verificar_coleccion_de_test(nombre)
    return MilvusSettings(
        milvus_uri=uri,
        milvus_collection_name=nombre,
        embedding_dim=dimension,
        vector_index_type="HNSW",
        vector_index_params=INDICE_DE_ADR39,
        milvus_dense_metric_type="COSINE",
        _env_file=None,
    )


def eliminar_coleccion_de_test(cliente: MilvusClient, nombre: str) -> None:
    """Limpieza del arnés (fuera del código bajo prueba): solo colecciones ``corpus_test_*``."""
    verificar_coleccion_de_test(nombre)
    if cliente.has_collection(nombre):
        cliente.drop_collection(nombre)


def chunk_sintetico(
    identificador: str,
    vector: list[float],
    *,
    sparse: dict[int, float] | None = None,
    vigente: bool = True,
) -> ChunkDelCorpus:
    return ChunkDelCorpus(
        chunk_id=identificador,
        document_id=f"doc-{identificador}",
        dense_vector=vector,
        chunk_text=f"Texto sintético del chunk {identificador}.",
        chunk_index=0,
        section="resultados",
        source_type="guideline",
        language="es",
        cancer_type_tags="mama",
        population="adulto",
        study_design="guia",
        published_year=2024,
        is_current=vigente,
        created_at_ms=EPOCA_FIJA_MS,
        sparse_vector=sparse,
    )


def vector_unitario(dimension: int, posicion: int) -> list[float]:
    """Vector sintético determinista: 1.0 en ``posicion``, 0.0 en el resto."""
    return [1.0 if i == posicion else 0.0 for i in range(dimension)]
