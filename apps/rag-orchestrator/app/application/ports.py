"""Puertos de la capa de aplicación. Cada change de rag-orchestrator añade aquí los suyos."""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Protocol

from app.schemas.generated.models import RagQueryInternalRequest, RagQueryInternalResponse


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
    score: float


class CorpusChunkStore(Protocol):
    """Almacén vectorial de chunks del corpus (Milvus). Lo consumen L1D-106 (recuperación) y L1D-115 (ingesta).

    ``search_dense`` solo devuelve chunks ``is_current`` (RN-05). Un vector de dimensión distinta a ``EMBEDDING_DIM``
    se rechaza con un error y no cambia el conteo.
    """

    def ensure_collection(self) -> bool:
        """Crea la colección si no existe (``True``) o la deja intacta si coincide con el esquema (``False``)."""
        ...

    def insert_chunks(self, chunks: Sequence[ChunkDelCorpus]) -> int: ...

    def search_dense(self, vector: Sequence[float], limit: int) -> list[ChunkEncontrado]: ...
