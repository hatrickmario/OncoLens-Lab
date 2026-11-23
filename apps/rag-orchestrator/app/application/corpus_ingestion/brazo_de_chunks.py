"""Ingesta del brazo de chunks de 512 tokens del reranker (US-278, ``[S7 resp. 14]``): los mismos documentos, otra colección.

Fragmenta de nuevo los documentos que la ingesta de ``l1d-119`` dejó vigentes (mismo manifiesto, mismo texto normalizado, mismo
``document_id``) y escribe SOLO en una colección de Milvus propia. El catálogo ``corpus`` entra por su puerto de LECTURA
(``LectorDePoblacionDelCorpus``: no tiene ningún método de escritura) y el almacén recibido es el de la colección nueva, así que ni
el catálogo compartido ni la colección de origen se tocan (RN-05). Los metadatos de cada chunk se COPIAN del registro del catálogo
(RN-04, RN-25): no hay LLM ni NLI. Es una ingesta aparte, no ``reindex-context`` de ``l1d-337``: aquí cambian los límites de los
chunks. Un documento que falla deja un error por etapa y la clase (nunca el mensaje) y el lote sigue.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

from app.application.corpus_ingestion.ports import SparsePassageEncoder
from app.application.ports import Clock
from app.application.seed_corpus.ports import (
    ChunkStoreDeIngesta,
    LectorDePoblacionDelCorpus,
    PassageEmbedder,
    SourceFetcher,
)
from app.domain.corpus_seed.chunking import Tokenizador
from app.domain.corpus_seed.documento import DocumentoDeSemilla


@dataclass(frozen=True)
class ResultadoDelBrazo:
    document_key: str
    chunks: int = 0
    omitido: str | None = None
    """Motivo por el que el documento no entró (``sin_registro_vigente``); ``None`` si entró o falló."""
    error: str | None = None
    """``<etapa>: <clase>``; nunca el mensaje de la excepción (RN-14)."""


@dataclass(frozen=True)
class ReporteDelBrazo:
    resultados: tuple[ResultadoDelBrazo, ...]

    @property
    def chunks(self) -> int:
        return sum(r.chunks for r in self.resultados)

    @property
    def hubo_errores(self) -> bool:
        return any(r.error is not None for r in self.resultados)


class IngerirBrazoDeChunks:
    def __init__(
        self,
        *,
        catalogo: LectorDePoblacionDelCorpus,
        fuente: SourceFetcher,
        almacen: ChunkStoreDeIngesta,
        embedder: PassageEmbedder,
        codificador_sparse: SparsePassageEncoder,
        tokenizador: Tokenizador,
        tamano_de_chunk: int,
        solape_de_chunk: int,
        reloj: Clock,
    ) -> None:
        self._catalogo = catalogo

    def ingerir(self, documentos: Sequence[DocumentoDeSemilla]) -> ReporteDelBrazo:
        return ReporteDelBrazo(())  # esqueleto: aún no ingiere nada
