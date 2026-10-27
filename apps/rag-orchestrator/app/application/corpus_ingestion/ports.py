"""Puertos propios de la ingesta en lote (US-117a, L1D-116).

La ingesta reutiliza los puertos de la semilla (``PassageEmbedder``, ``SourceFetcher``, ``ChunkStoreDeIngesta``,
``CorpusCatalog``) y añade el del vector *sparse* (``SparsePassageEncoder``), que ``ingest reindex-sparse`` (US-117b)
reutiliza, y el del almacén de la reindexación (``AlmacenDeReindexacionSparse``).
"""

from __future__ import annotations

from collections.abc import Iterator, Mapping, Sequence
from dataclasses import dataclass
from typing import Any, Protocol

from app.domain.corpus_metadata.resultado import MetadatosResueltos
from app.domain.corpus_seed.documento import DocumentoDeSemilla


class SparsePassageEncoder(Protocol):
    """Vector *sparse* léxico de PASAJES (ADR-39, ``SPARSE_VECTOR_SOURCE``): ``{id_de_token: peso}`` por texto.

    Devuelve un mapa por texto, en el mismo orden, y NUNCA vacío: un pasaje sin términos con peso es un fallo del
    adapter (Milvus rechaza el vector vacío), no un resultado válido. Separado del ``PassageEmbedder`` para que el
    reindexado de US-117b no tenga que recalcular el *dense*.
    """

    def codificar(self, textos: Sequence[str]) -> list[dict[int, float]]: ...


class ResolutorDeMetadatos(Protocol):
    """Paso de metadatos de la ingesta (US-118, D1): decide qué metadatos y qué ``metadata_source`` lleva un documento.

    Recibe el documento del manifiesto, su texto normalizado y sus fragmentos. NUNCA lanza por un fallo del LLM o del NLI:
    devuelve el documento ``pendiente`` con el motivo (la indexación no se bloquea, RN-25). Es SÍNCRONO y solo para la CLI
    de ingesta: no se invoca desde un bucle de eventos (el LLM es asíncrono y el servicio lo ejecuta con ``asyncio.run``).
    """

    def resolver(
        self, documento: DocumentoDeSemilla, texto: str, fragmentos: Sequence[str]
    ) -> MetadatosResueltos: ...


@dataclass(frozen=True)
class ChunkParaReindexar:
    """Un chunk vigente leído del almacén: lo que el *sparse* necesita (``chunk_text``) y el registro COMPLETO opaco.

    ``registro`` solo lo entiende el almacén que lo leyó: ``reescribir_sparse`` lo devuelve con ``sparse_vector``
    sustituido y todo lo demás (``chunk_id``, ``dense_vector``, ``is_current``…) tal como llegó.
    """

    chunk_id: str
    chunk_text: str
    registro: Mapping[str, Any]


class AlmacenDeReindexacionSparse(Protocol):
    """Lo que ``ingest reindex-sparse`` pide al almacén vectorial (US-117b D2): leer los vigentes por páginas y reescribir
    solo su *sparse*."""

    def listar_vigentes_paginado(self, lote: int) -> Iterator[list[ChunkParaReindexar]]:
        """Todos los chunks ``is_current`` en páginas de ``lote`` como máximo, sin repetir ni omitir ninguno.

        ``lote`` fuera de ``0 < lote < LIMITE_DE_CONSULTA`` se rechaza con ``ValueError`` (antes de leer nada).
        """
        ...

    def reescribir_sparse(
        self, chunks: Sequence[ChunkParaReindexar], vectores_sparse: Sequence[Mapping[int, float]]
    ) -> int:
        """Reescribe cada chunk con su ``sparse_vector`` nuevo y nada más. Devuelve cuántos escribió."""
        ...
