"""Adapter de Milvus del puerto ``CorpusChunkStore`` (US-058, L1D-114).

Idempotente y conservador: ``ensure_collection()`` crea la colección con su esquema final o comprueba que la existente
coincide; ante una diferencia lanza ``CorpusCollectionSchemaMismatch`` y NO toca la colección. Este paquete nunca
elimina colecciones (D5): reindexar por un cambio de modelo es una operación manual gobernada por ADR-39.
El cliente ``pymilvus`` se inyecta (real en integración y E2E).
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from pymilvus import MilvusClient

from app.application.ports import ChunkDelCorpus, ChunkEncontrado
from app.config.settings import MilvusSettings
from app.infrastructure.milvus.schema import (
    CAMPO_DENSE,
    CAMPO_SPARSE,
    build_corpus_chunks_indexes,
    build_corpus_chunks_schema,
    campos_esperados,
    parametros_de_busqueda,
)


class CorpusCollectionSchemaMismatch(RuntimeError):
    """La colección existente no coincide con el esquema esperado. El mensaje nombra campo, lo esperado y lo hallado."""

    def __init__(self, campo: str, esperado: str, encontrado: str) -> None:
        self.campo, self.esperado, self.encontrado = campo, esperado, encontrado
        super().__init__(f"{campo}: se esperaba {esperado} y la colección tiene {encontrado}")


class MilvusRepository:
    def __init__(self, cliente: MilvusClient, ajustes: MilvusSettings) -> None:
        self._cliente = cliente
        self._ajustes = ajustes
        self._coleccion = ajustes.milvus_collection_name

    def ensure_collection(self) -> bool:
        if self._cliente.has_collection(self._coleccion):
            self.assert_schema_matches()
            self._cliente.load_collection(self._coleccion)
            return False
        self._cliente.create_collection(
            self._coleccion,
            schema=build_corpus_chunks_schema(self._ajustes),
            index_params=build_corpus_chunks_indexes(self._cliente, self._ajustes),
        )
        return True

    def assert_schema_matches(self) -> None:
        """Compara nombre, tipo y dimensión de cada campo con el esquema esperado (D5)."""
        hallados = {
            campo["name"]: campo
            for campo in self._cliente.describe_collection(self._coleccion)["fields"]
        }
        for esperado in campos_esperados(self._ajustes):
            hallado = hallados.get(esperado.nombre)
            if hallado is None:
                raise CorpusCollectionSchemaMismatch(
                    esperado.nombre, str(esperado.tipo.name), "campo ausente"
                )
            if hallado["type"] != esperado.tipo:
                raise CorpusCollectionSchemaMismatch(
                    esperado.nombre, esperado.tipo.name, hallado["type"].name
                )
            dimension = hallado.get("params", {}).get("dim")
            if esperado.dimension is not None and dimension != esperado.dimension:
                raise CorpusCollectionSchemaMismatch(
                    esperado.nombre, str(esperado.dimension), str(dimension)
                )
        sobrantes = set(hallados) - {c.nombre for c in campos_esperados(self._ajustes)}
        if sobrantes:
            raise CorpusCollectionSchemaMismatch(
                min(sobrantes), "campo inexistente", "campo presente"
            )

    def insert_chunks(self, chunks: Sequence[ChunkDelCorpus]) -> int:
        resultado = self._cliente.insert(self._coleccion, [self._fila(chunk) for chunk in chunks])
        return int(resultado["insert_count"])

    def search_dense(self, vector: Sequence[float], limit: int) -> list[ChunkEncontrado]:
        """Solo chunks ``is_current`` (RN-05); ``score`` es el que devuelve Milvus con la métrica configurada."""
        resultados = self._cliente.search(
            self._coleccion,
            data=[list(vector)],
            anns_field=CAMPO_DENSE,
            limit=limit,
            filter="is_current == true",
            search_params=parametros_de_busqueda(self._ajustes),
            output_fields=["chunk_id", "document_id", "chunk_text"],
        )
        return [
            ChunkEncontrado(
                chunk_id=hit["entity"]["chunk_id"],
                document_id=hit["entity"]["document_id"],
                chunk_text=hit["entity"]["chunk_text"],
                score=float(hit["distance"]),
            )
            for hit in resultados[0]
        ]

    @staticmethod
    def _fila(chunk: ChunkDelCorpus) -> dict[str, Any]:
        # Sin sparse (S1, D4) se inserta el vector sparse vacío: Milvus lo acepta sin cambiar el esquema.
        return {
            "chunk_id": chunk.chunk_id,
            "document_id": chunk.document_id,
            CAMPO_DENSE: list(chunk.dense_vector),
            CAMPO_SPARSE: dict(chunk.sparse_vector or {}),
            "chunk_text": chunk.chunk_text,
            "chunk_index": chunk.chunk_index,
            "section": chunk.section,
            "source_type": chunk.source_type,
            "language": chunk.language,
            "cancer_type_tags": chunk.cancer_type_tags,
            "population": chunk.population,
            "study_design": chunk.study_design,
            "published_year": chunk.published_year,
            "is_current": chunk.is_current,
            "created_at": chunk.created_at_ms,
        }
