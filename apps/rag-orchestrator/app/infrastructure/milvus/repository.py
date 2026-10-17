"""Adapter de Milvus del puerto ``CorpusChunkStore`` (US-058, L1D-114).

Idempotente y conservador: ``ensure_collection()`` crea la colección con su esquema final o comprueba que la existente
coincide; ante una diferencia lanza ``CorpusCollectionSchemaMismatch`` y NO toca la colección. Este paquete nunca
elimina colecciones (D5): reindexar por un cambio de modelo es una operación manual gobernada por ADR-39.
El cliente ``pymilvus`` se inyecta (real en integración y E2E).
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from typing import Any

from pymilvus import MilvusClient
from pymilvus.exceptions import MilvusException

from app.application.ports import ChunkDelCorpus, ChunkEncontrado, DimensionDeVectorInvalida
from app.config.settings import MilvusSettings
from app.domain.retrieval_filter import exigir_filtro_vigente, expresion_solo_vigente
from app.infrastructure.milvus.schema import (
    CAMPO_DENSE,
    CAMPO_SPARSE,
    build_corpus_chunks_indexes,
    build_corpus_chunks_schema,
    campos_esperados,
    search_params,
)

CODIGO_PARAMETRO_INVALIDO = (
    1100  # código de Milvus para 'invalid parameter' (dimensión incorrecta incluida)
)


# Tope de entidades que Milvus devuelve en una consulta por filtro (offset + limit <= 16384).
LIMITE_DE_CONSULTA = 16384


def _exigir_completo(filas: Sequence[Any]) -> None:
    """Milvus corta una consulta en ``LIMITE_DE_CONSULTA``: con exactamente ese número puede faltar el resto."""
    if len(filas) >= LIMITE_DE_CONSULTA:
        raise ConsultaTruncada(f"la consulta alcanzó el tope de {LIMITE_DE_CONSULTA} entidades")


def _filtro_por_documento(document_id: str) -> str:
    """``document_id == "<id>"``; el identificador lo genera el cargador, y una comilla o barra se rechaza igualmente."""
    if '"' in document_id or "\\" in document_id:
        raise ValueError("document_id no puede llevar comillas ni barras invertidas")
    return f'document_id == "{document_id}"'


class ConsultaTruncada(RuntimeError):
    """La consulta devolvió exactamente el tope de Milvus: puede faltar el resto, y no se actúa con un resultado parcial."""


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
        self._assert_indice_denso_coincide()

    def _assert_indice_denso_coincide(self) -> None:
        """Métrica y tipo del índice dense contra la configuración (D5): solo valores de configuración, sin datos."""
        indice = self._cliente.describe_index(self._coleccion, CAMPO_DENSE)
        for atributo, esperado in (
            ("metric_type", self._ajustes.milvus_dense_metric_type),
            ("index_type", self._ajustes.vector_index_type),
        ):
            encontrado = indice.get(atributo)
            if encontrado != esperado:
                raise CorpusCollectionSchemaMismatch(
                    f"{CAMPO_DENSE}.{atributo}", esperado, str(encontrado)
                )

    def insert_chunks(self, chunks: Sequence[ChunkDelCorpus]) -> int:
        """Inserta los chunks y devuelve cuántos entraron.

        Lanza ``DimensionDeVectorInvalida`` si algún vector dense no tiene la dimensión ``EMBEDDING_DIM`` de la colección;
        cualquier otro error de Milvus se propaga sin traducir.
        """
        return self._escribir(self._cliente.insert, "insert_count", chunks)

    def upsert_chunks(self, chunks: Sequence[ChunkDelCorpus]) -> int:
        """Inserta o reescribe por ``chunk_id`` (idempotente: reintentos y readmisión de una versión retirada).

        Mismos errores que ``insert_chunks``.
        """
        return self._escribir(self._cliente.upsert, "upsert_count", chunks)

    def _escribir(
        self, operacion: Callable[..., Any], clave_del_conteo: str, chunks: Sequence[ChunkDelCorpus]
    ) -> int:
        try:
            resultado = operacion(self._coleccion, [self._fila(chunk) for chunk in chunks])
        except MilvusException as error:
            if CODIGO_PARAMETRO_INVALIDO == error.code and "dim" in str(error):
                raise DimensionDeVectorInvalida(
                    f"el vector dense no tiene la dimensión {self._ajustes.embedding_dim} de la colección"
                ) from None
            raise
        return int(resultado[clave_del_conteo])

    def search_dense(
        self, vector: Sequence[float], limit: int, filtro: str | None = None
    ) -> list[ChunkEncontrado]:
        """Solo chunks ``is_current`` (RN-05); ``similitud_dense`` es la que devuelve Milvus con ``MILVUS_DENSE_METRIC_TYPE`` (no es ``relevance_score``, RN-03).

        ``filtro`` viene de ``expresion_vigente_del_tipo()``; una expresión que no exija ``is_current`` como condición
        obligatoria se rechaza con ``ValueError`` antes de llegar a Milvus.
        """
        filtro = expresion_solo_vigente() if filtro is None else exigir_filtro_vigente(filtro)
        resultados = self._cliente.search(
            self._coleccion,
            data=[list(vector)],
            anns_field=CAMPO_DENSE,
            limit=limit,
            filter=filtro,
            search_params=search_params(self._ajustes),
            output_fields=["chunk_id", "document_id", "chunk_text"],
        )
        return [
            ChunkEncontrado(
                chunk_id=hit["entity"]["chunk_id"],
                document_id=hit["entity"]["document_id"],
                chunk_text=hit["entity"]["chunk_text"],
                similitud_dense=float(hit["distance"]),
            )
            for hit in resultados[0]
        ]

    def marcar_no_vigentes(self, document_id: str) -> int:
        """``is_current = false`` en los chunks vigentes del documento, sin borrar ninguno (RN-05).

        Milvus no actualiza un campo suelto: se relee cada entidad con sus vectores y se reescribe con ``upsert`` por
        ``chunk_id`` (mismo PK). Devuelve cuántos chunks cambió; sin vigentes, 0.
        """
        return self._reescribir_vigencia(document_id, desde=True)

    def marcar_vigentes(self, document_id: str) -> int:
        """``is_current = true`` en los chunks no vigentes del documento (reconciliación de la vigente del catálogo).

        Mismo mecanismo y mismos errores que ``marcar_no_vigentes``; sin chunks apagados, 0.
        """
        return self._reescribir_vigencia(document_id, desde=False)

    def _reescribir_vigencia(self, document_id: str, *, desde: bool) -> int:
        filas = self._cliente.query(
            self._coleccion,
            filter=f"{_filtro_por_documento(document_id)} and is_current == {str(desde).lower()}",
            output_fields=["*"],
            limit=LIMITE_DE_CONSULTA,
            consistency_level="Strong",
        )
        _exigir_completo(filas)
        if not filas:
            return 0
        self._cliente.upsert(self._coleccion, [{**fila, "is_current": not desde} for fila in filas])
        return len(filas)

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
