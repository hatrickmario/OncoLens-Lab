"""Caso de uso de la ingesta en lote reanudable del corpus (US-117a, L1D-116)."""

from __future__ import annotations

from collections.abc import Sequence
from datetime import date

from app.application.corpus_ingestion.ports import SparsePassageEncoder
from app.application.corpus_ingestion.reporte import ReporteDeIngesta
from app.application.ports import Clock
from app.application.seed_corpus.ports import (
    ChunkStoreDeIngesta,
    CorpusCatalog,
    IdGenerator,
    PassageEmbedder,
    SourceFetcher,
)
from app.domain.corpus_seed.admisibilidad import PoliticaDeLicencias
from app.domain.corpus_seed.chunking import Tokenizador
from app.domain.corpus_seed.documento import DocumentoDeSemilla


class IngestionPipelineService:
    def __init__(
        self,
        *,
        catalogo: CorpusCatalog,
        almacen_de_chunks: ChunkStoreDeIngesta,
        embedder: PassageEmbedder,
        codificador_sparse: SparsePassageEncoder,
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
        self._almacen_de_chunks = almacen_de_chunks
        self._embedder = embedder
        self._codificador_sparse = codificador_sparse
        self._fuente = fuente
        self._reloj = reloj
        self._ids = ids
        self._politica = politica
        self._tokenizador = tokenizador
        self._tamano_de_chunk = tamano_de_chunk
        self._solape_de_chunk = solape_de_chunk
        self._fecha_de_corte = fecha_de_corte

    def ingerir(self, documentos: Sequence[DocumentoDeSemilla]) -> ReporteDeIngesta:
        raise NotImplementedError("no implementado")
