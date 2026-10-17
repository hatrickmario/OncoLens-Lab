"""Caso de uso del cargador de la semilla del corpus (US-059, L1D-115).

Admisibilidad -> texto -> versión -> chunks -> embeddings -> Milvus -> catálogo -> release. Cada etapa es un método;
las reglas viven en ``app/domain/corpus_seed`` y las E/S llegan por los puertos de ``ports.py``.
"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import date

from app.application.ports import Clock
from app.application.seed_corpus.ports import (
    ChunkStore,
    CorpusCatalog,
    IdGenerator,
    PassageEmbedder,
    SourceFetcher,
)
from app.application.seed_corpus.reporte import ReporteDeCarga
from app.domain.corpus_seed.admisibilidad import PoliticaDeLicencias
from app.domain.corpus_seed.chunking import Tokenizador
from app.domain.corpus_seed.documento import DocumentoDeSemilla


class SeedCorpusLoader:
    def __init__(  # noqa: PLR0913 - raíz de composición del caso de uso: un puerto por colaborador
        self,
        *,
        catalogo: CorpusCatalog,
        chunks: ChunkStore,
        embedder: PassageEmbedder,
        fuente: SourceFetcher,
        reloj: Clock,
        ids: IdGenerator,
        politica: PoliticaDeLicencias,
        tokenizador: Tokenizador,
        tamano_de_chunk: int,
        solape_de_chunk: int,
        fecha_de_corte: date,
    ) -> None:
        self._catalogo = catalogo
        self._chunks = chunks
        self._embedder = embedder
        self._fuente = fuente
        self._reloj = reloj
        self._ids = ids
        self._politica = politica
        self._tokenizador = tokenizador
        self._tamano_de_chunk = tamano_de_chunk
        self._solape_de_chunk = solape_de_chunk
        self._fecha_de_corte = fecha_de_corte

    def cargar(self, documentos: Sequence[DocumentoDeSemilla]) -> ReporteDeCarga:
        raise NotImplementedError("no implementado")
