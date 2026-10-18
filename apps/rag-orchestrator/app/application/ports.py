"""Puertos de la capa de aplicación. Cada change de rag-orchestrator añade aquí los suyos."""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import date, datetime
from typing import Literal, Protocol

from app.domain.relevance import ChunkPuntuado
from app.schemas.generated.models import (
    RagMeta,
    RagQueryInternalRequest,
    RagQueryInternalResponse,
)


class LlmHealthPort(Protocol):
    """Sonda del LLM nativo: `True` si responde, `False` si no (conexión, timeout o 5xx)."""

    async def esta_disponible(self) -> bool: ...


class EvidenceQueryPort(Protocol):
    """Consulta de evidencia de `/rag/query`; el enlace real es de L1D-106, el `fake` de L1D-164."""

    async def consultar(self, solicitud: RagQueryInternalRequest) -> RagQueryInternalResponse: ...


class TraceIdGenerator(Protocol):
    """Genera `traceId` (`req_` + 8–32 alfanuméricos); inyectado para que los tests lo congelen."""

    def nuevo(self) -> str: ...


class Clock(Protocol):
    """Reloj inyectado (UTC): los tests lo congelan; nada de `time.time()` directo en dominio ni servicios."""

    def ahora(self) -> datetime: ...


class ServiceTokenVerifierPort(Protocol):
    """Verifica el JWT de servicio de `clinical-api`; lanza `TokenServicioInvalido(motivo)` si no es válido."""

    def verificar(self, token: str | None) -> None: ...


class DimensionDeVectorInvalida(ValueError):
    """El vector dense no tiene la dimensión ``EMBEDDING_DIM`` de la colección; no se insertó ningún chunk."""


@dataclass(frozen=True)
class ChunkDelCorpus:
    """Un chunk listo para indexar (data-model §4.7). ``sparse_vector`` ausente = sin poblar (S1, US-058 AC-3).

    ``created_at_ms`` es la época en milisegundos y la entrega quien llama (reloj inyectado, nunca el del repositorio).
    """

    chunk_id: str
    document_id: str
    dense_vector: Sequence[float]
    chunk_text: str
    chunk_index: int
    section: str
    source_type: str
    language: str
    cancer_type_tags: str
    population: str
    study_design: str
    published_year: int
    is_current: bool
    created_at_ms: int
    sparse_vector: Mapping[int, float] | None = None


@dataclass(frozen=True)
class ChunkEncontrado:
    chunk_id: str
    document_id: str
    chunk_text: str
    similitud_dense: float
    """Similitud dense de Milvus según ``MILVUS_DENSE_METRIC_TYPE``. NO es ``relevance_score`` (RN-03): no ordena opciones."""


class ChunkSearch(Protocol):
    """Búsqueda dense del corpus (Milvus); la implementa ``MilvusRepository``."""

    def search_dense(
        self, vector: Sequence[float], limit: int, filtro: str | None = None
    ) -> list[ChunkEncontrado]:
        """``filtro`` viene de ``expresion_vigente_del_tipo()``; ausente, solo ``is_current == true`` (RN-05)."""
        ...


class CorpusChunkStore(ChunkSearch, Protocol):
    """Almacén vectorial de chunks del corpus (Milvus). Lo consumen L1D-106 (recuperación) y L1D-115 (ingesta).

    ``search_dense`` solo devuelve chunks ``is_current`` (RN-05). Un vector de dimensión distinta a ``EMBEDDING_DIM``
    se rechaza con un error y no cambia el conteo.
    """

    def ensure_collection(self) -> bool:
        """Crea la colección si no existe (``True``) o la deja intacta si coincide con el esquema (``False``)."""
        ...

    def insert_chunks(self, chunks: Sequence[ChunkDelCorpus]) -> int: ...


# --- Recuperación de /rag/query (US-055, L1D-106) --------------------------------------------------------------------

Idioma = Literal["es", "en"]


class FalloDeInferencia(RuntimeError):
    """Un modelo local (embeddings, reranker) no pudo inferir: archivo corrupto, tokenizer o tensor inesperado.

    Es el único error que los adapters reales de recuperación lanzan; el servicio lo convierte en
    ``503 RETRIEVAL_UNAVAILABLE``. El mensaje nombra la etapa y nunca lleva texto de la pregunta ni del chunk.
    """


class LanguageDetector(Protocol):
    def detectar(self, texto: str) -> Idioma: ...


class QueryEmbedder(Protocol):
    """*Embeddings* de la pregunta y del resumen del contexto. Un fallo se propaga: el servicio lo traduce a 503."""

    @property
    def modelo(self) -> str:
        """Identificador exacto del modelo, para ``meta.embeddingModel`` (nunca un literal del servicio)."""
        ...

    def embeber(self, texto: str) -> Sequence[float]: ...


class Reranker(Protocol):
    """Puntúa candidatos contra la pregunta. Devuelve un puntaje por candidato, en el mismo orden y ya en [0, 1] (RN-03).

    El contrato incluye ``None`` ≠ ``0.0``: este puerto nunca devuelve ``None``; si no puede puntuar, lanza un error.
    """

    @property
    def version(self) -> str:
        """Versión exacta del reranker, para ``meta.rerankerModel`` (IA-07)."""
        ...

    def puntuar(self, pregunta: str, candidatos: Sequence[ChunkEncontrado]) -> list[float]: ...


@dataclass(frozen=True)
class ReleaseDelCorpus:
    release_id: str
    cutoff_date: date
    excluded_sources: tuple[str, ...]


class CorpusReleaseReader(Protocol):
    """Lee del schema ``corpus`` la release vigente (``meta.corpusRelease``, ``corpusCutoffDate``, ``excludedSources``)."""

    def release_vigente(self) -> ReleaseDelCorpus: ...


@dataclass(frozen=True)
class ResultadoDeRecuperacion:
    """Lo que la recuperación entrega a la generación: solo chunks sobre el umbral, ya puntuados (RN-02)."""

    chunks_sobre_umbral: tuple[ChunkPuntuado, ...]
    recuperados: int
    meta: RagMeta


class EvidenceGenerator(Protocol):
    """Rama con evidencia sobre el umbral (prompt, LLM, citas, soporte, recorte): la implementa L1D-275 (US-225)."""

    async def generar(
        self, solicitud: RagQueryInternalRequest, recuperacion: ResultadoDeRecuperacion
    ) -> RagQueryInternalResponse: ...
