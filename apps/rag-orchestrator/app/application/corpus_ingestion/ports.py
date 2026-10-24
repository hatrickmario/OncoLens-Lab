"""Puertos propios de la ingesta en lote (US-117a, L1D-116).

La ingesta reutiliza los puertos de la semilla (``PassageEmbedder``, ``SourceFetcher``, ``ChunkStoreDeIngesta``,
``CorpusCatalog``) y añade solo el del vector *sparse*: US-117b lo reutiliza para ``--reindex-sparse``.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Protocol

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
    devuelve el documento ``pendiente`` con el motivo (la indexación no se bloquea, RN-25).
    """

    def resolver(
        self, documento: DocumentoDeSemilla, texto: str, fragmentos: Sequence[str]
    ) -> MetadatosResueltos: ...
