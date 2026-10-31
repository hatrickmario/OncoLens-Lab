"""Catálogo y almacén de chunks en memoria para los unitarios del cargador (US-059), con el contrato de los reales.

Son fakes de los PUERTOS (``CorpusCatalog`` y ``ChunkStoreDeIngesta``): conservan lo que el cargador necesita observar y cumplen
las mismas reglas que los adapters reales (LSP): ``guardar_documento`` es un *upsert* por ``document_id``,
``reemplazar_version`` es atómico, ``insert_chunks`` rechaza una dimensión distinta con ``DimensionDeVectorInvalida`` y
``marcar_no_vigentes`` no borra nada. ``fallar_en`` inyecta un error en un método para probar los fallos de dependencias.
"""

from __future__ import annotations

from collections.abc import Iterator, Mapping, Sequence
from dataclasses import replace
from datetime import datetime
from typing import Any

from app.application.corpus_ingestion.ports import ChunkParaReindexar
from app.application.corpus_metadata.poblacion_puertos import PoblacionGuardada
from app.application.ports import ChunkDelCorpus, ChunkEncontrado, DimensionDeVectorInvalida
from app.application.seed_corpus.ports import (
    RegistroDeDocumento,
    RegistroDeRelease,
    VersionInexistente,
)
from app.domain.corpus_metadata.resultado import solo_extraidos_verificados
from app.domain.corpus_seed.versionado import STATUS_EMBEBIDO, VersionExistente
from app.infrastructure.milvus.repository import LIMITE_DE_CONSULTA
from tests.support.milvus import DIMENSION_DE_TEST


class CatalogoEnMemoria:
    def __init__(self) -> None:
        self.documentos: dict[str, RegistroDeDocumento] = {}
        self.releases: list[RegistroDeRelease] = []
        self.fallar_en: dict[str, Exception] = {}
        # ``guardar_documento`` falla solo al guardar un registro con este ``status`` (p. ej. el ``embebido`` de confirmar).
        self.fallar_al_guardar_status: dict[str, Exception] = {}
        self.escrituras_de_poblacion = 0

    def _puede(self, metodo: str) -> None:
        if metodo in self.fallar_en:
            raise self.fallar_en[metodo]

    def versiones_del_grupo(self, version_group_id: str) -> list[VersionExistente]:
        self._puede("versiones_del_grupo")
        return [
            VersionExistente(r.document_id, r.checksum, r.is_current, r.status)
            for r in self.documentos.values()
            if r.version_group_id == version_group_id
        ]

    def guardar_documento(self, registro: RegistroDeDocumento) -> None:
        self._puede("guardar_documento")
        if registro.status in self.fallar_al_guardar_status:
            raise self.fallar_al_guardar_status[registro.status]
        self.documentos[registro.document_id] = registro

    def reemplazar_version(
        self, nuevo: RegistroDeDocumento, anterior_id: str, superseded_at: datetime
    ) -> None:
        self._puede("reemplazar_version")
        anterior = self.documentos.get(anterior_id)
        if anterior is None:  # antes de tocar nada: atómico, como la transacción del real
            raise VersionInexistente(anterior_id)
        self.documentos[nuevo.document_id] = nuevo
        self.documentos[anterior_id] = replace(
            anterior, is_current=False, superseded_at=superseded_at
        )

    def retirar_version(self, document_id: str, superseded_at: datetime) -> None:
        self._puede("retirar_version")
        registro = self.documentos.get(document_id)
        if registro is None:
            raise VersionInexistente(document_id)
        self.documentos[document_id] = replace(
            registro, is_current=False, superseded_at=superseded_at
        )

    def leer_poblacion(self, document_id: str) -> PoblacionGuardada | None:
        registro = self.documentos.get(document_id)
        if registro is None:
            return None
        return PoblacionGuardada(
            registro.population_criteria,
            registro.population_form,
            registro.metadata_source,
            registro.extracted_fields,
        )

    def guardar_poblacion(
        self,
        document_id: str,
        population_criteria: Mapping[str, Any],
        population_form: str,
        extracted_fields: Sequence[str],
    ) -> None:
        self._puede("guardar_poblacion")
        self.escrituras_de_poblacion += 1
        registro = self.documentos.get(document_id)
        if registro is None:  # como el UPDATE real: ninguna fila afectada es un fallo, no un alta
            raise VersionInexistente(document_id)
        self.documentos[document_id] = replace(
            registro,
            population_criteria=population_criteria,
            population_form=population_form,
            extracted_fields=tuple(extracted_fields),
        )

    def ids_de_documentos_vigentes(self) -> frozenset[str]:
        return frozenset(
            i for i, r in self.documentos.items() if r.is_current and r.status == STATUS_EMBEBIDO
        )

    def ids_de_la_ultima_release(self) -> frozenset[str] | None:
        return frozenset(self.releases[-1].document_ids) if self.releases else None

    def publicar_release(self, release: RegistroDeRelease) -> None:
        self._puede("publicar_release")
        self.releases.append(release)

    def documentos_extraidos_de_la_release(self, release_id: str) -> list[RegistroDeDocumento]:
        self._puede("documentos_extraidos_de_la_release")
        ids = next(
            (set(r.document_ids) for r in self.releases if r.release_id == release_id), set()
        )
        return solo_extraidos_verificados(r for i, r in self.documentos.items() if i in ids)


class AlmacenDeChunksEnMemoria:
    def __init__(self, dimension: int = DIMENSION_DE_TEST) -> None:
        self.dimension = dimension
        self.chunks: dict[str, ChunkDelCorpus] = {}
        self.fallar_en: dict[str, Exception] = {}

    def _puede(self, metodo: str) -> None:
        if metodo in self.fallar_en:
            raise self.fallar_en[metodo]

    def ensure_collection(self) -> bool:
        return False

    def upsert_chunks(self, chunks: list[ChunkDelCorpus]) -> int:
        self._puede("upsert_chunks")
        if any(len(c.dense_vector) != self.dimension for c in chunks):
            raise DimensionDeVectorInvalida("dimensión distinta de EMBEDDING_DIM")
        for chunk in chunks:
            self.chunks[chunk.chunk_id] = chunk
        return len(chunks)

    def search_dense(self, vector: list[float], limit: int) -> list[ChunkEncontrado]:  # type: ignore[override]
        vigentes = [c for c in self.chunks.values() if c.is_current]
        puntuados = [
            ChunkEncontrado(
                c.chunk_id,
                c.document_id,
                c.chunk_text,
                sum(a * b for a, b in zip(vector, c.dense_vector, strict=True)),
            )
            for c in vigentes
        ]
        return sorted(puntuados, key=lambda r: -r.similitud_dense)[:limit]

    def marcar_no_vigentes(self, document_id: str) -> int:
        self._puede("marcar_no_vigentes")
        cambiados = [
            i for i, c in self.chunks.items() if c.document_id == document_id and c.is_current
        ]
        for identificador in cambiados:
            self.chunks[identificador] = replace(self.chunks[identificador], is_current=False)
        return len(cambiados)

    def marcar_vigentes(self, document_id: str) -> int:
        self._puede("marcar_vigentes")
        cambiados = [
            i for i, c in self.chunks.items() if c.document_id == document_id and not c.is_current
        ]
        for identificador in cambiados:
            self.chunks[identificador] = replace(self.chunks[identificador], is_current=True)
        return len(cambiados)

    def listar_vigentes_paginado(self, lote: int) -> Iterator[list[ChunkParaReindexar]]:
        """Mismo contrato que ``MilvusRepository`` (LSP): lote estrictamente entre 0 y ``LIMITE_DE_CONSULTA``."""
        if not 0 < lote < LIMITE_DE_CONSULTA:
            raise ValueError("el lote debe ser positivo y menor que el tope de consulta")
        vigentes = sorted(
            (c for c in self.chunks.values() if c.is_current), key=lambda c: c.chunk_id
        )
        for inicio in range(0, len(vigentes), lote):
            self._puede("listar_vigentes_paginado")
            yield [
                ChunkParaReindexar(c.chunk_id, c.chunk_text, {"chunk": c})
                for c in vigentes[inicio : inicio + lote]
            ]

    def reescribir_sparse(
        self, chunks: Sequence[ChunkParaReindexar], vectores_sparse: Sequence[Mapping[int, float]]
    ) -> int:
        self._puede("reescribir_sparse")
        for chunk, sparse in zip(chunks, vectores_sparse, strict=True):
            original = chunk.registro["chunk"]
            self.chunks[original.chunk_id] = replace(original, sparse_vector=dict(sparse))
        return len(chunks)


class AlmacenConFallosInyectables:
    """Envuelve un ``ChunkStoreDeIngesta`` REAL (Milvus) e inyecta un error en ``marcar_no_vigentes``; el resto delega tal cual."""

    def __init__(self, real: object) -> None:
        self._real = real
        self.fallar_al_apagar: Exception | None = None

    def marcar_no_vigentes(self, document_id: str) -> int:
        if self.fallar_al_apagar is not None:
            raise self.fallar_al_apagar
        return self._real.marcar_no_vigentes(document_id)  # type: ignore[attr-defined, no-any-return]

    def __getattr__(self, nombre: str) -> object:
        return getattr(self._real, nombre)


class CatalogoConFallosInyectables:
    """Envuelve el ``CorpusCatalog`` REAL (PostgreSQL) e inyecta un error en los métodos de ``fallar_en``."""

    def __init__(self, real: object) -> None:
        self._real = real
        self.fallar_en: dict[str, Exception] = {}

    def __getattr__(self, nombre: str) -> object:
        if nombre in self.fallar_en:
            error = self.fallar_en[nombre]

            def falla(*_: object, **__: object) -> None:
                raise error

            return falla
        return getattr(self._real, nombre)
