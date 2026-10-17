"""`RAGOrchestratorService`: implementa `EvidenceQueryPort` con el tramo de recuperación de `/rag/query` (US-055)."""

from __future__ import annotations

from dataclasses import dataclass

from app.application.ports import (
    ChunkSearch,
    Clock,
    CorpusReleaseReader,
    EvidenceGenerator,
    LanguageDetector,
    QueryEmbedder,
    Reranker,
)
from app.schemas.generated.models import RagQueryInternalRequest, RagQueryInternalResponse


@dataclass(frozen=True)
class ParametrosDeRecuperacion:
    """Valores de configuración (RN-22) y versiones que acompañan a cada respuesta en ``meta``."""

    relevance_threshold: float
    retrieval_top_k: int
    rerank_top_n: int
    llm_model: str
    nli_model: str
    prompt_version: str


class RAGOrchestratorService:
    def __init__(
        self,
        *,
        detector_idioma: LanguageDetector,
        embedder: QueryEmbedder,
        buscador: ChunkSearch,
        reranker: Reranker,
        lector_release: CorpusReleaseReader,
        generador: EvidenceGenerator,
        reloj: Clock,
        parametros: ParametrosDeRecuperacion,
    ) -> None:
        self._detector_idioma = detector_idioma
        self._embedder = embedder
        self._buscador = buscador
        self._reranker = reranker
        self._lector_release = lector_release
        self._generador = generador
        self._reloj = reloj
        self._parametros = parametros

    async def consultar(self, solicitud: RagQueryInternalRequest) -> RagQueryInternalResponse:
        raise NotImplementedError
