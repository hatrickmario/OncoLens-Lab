"""Puertos de la capa de aplicación. Cada change de rag-orchestrator añade aquí los suyos."""

from collections.abc import Collection, Mapping, Sequence
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any, Literal, Protocol

from app.domain.aplicabilidad_tipos import PoblacionDelEstudio
from app.domain.applicability_text import FuenteParaProponer, PropuestaDePoblacion
from app.domain.citations import FichaDeFuente, OpcionGenerada
from app.domain.nli import ParNli, ResultadoNli
from app.domain.relevance import ChunkPuntuado
from app.domain.support import CampoGenerado
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
    """Puntaje de recuperación: la similitud dense de Milvus (``MILVUS_DENSE_METRIC_TYPE``) o, en modo híbrido, el puntaje
    ya fusionado de las dos ramas. NO es ``relevance_score`` (RN-03): solo elige candidatos, no ordena opciones."""


class ChunkSearch(Protocol):
    """Búsqueda dense del corpus (Milvus); la implementa ``MilvusRepository``."""

    def search_dense(
        self, vector: Sequence[float], limit: int, filtro: str | None = None
    ) -> list[ChunkEncontrado]:
        """``filtro`` viene de ``expresion_vigente_del_tipo()``; ausente, solo ``is_current == true`` (RN-05)."""
        ...


@dataclass(frozen=True)
class ChunkEncontradoSparse:
    """Un acierto de la rama *sparse* (US-112): ``similitud_sparse`` es el producto interno de Milvus.

    NO es ``relevance_score`` (RN-03): solo elige y ordena candidatos antes del *reranker*.
    """

    chunk_id: str
    document_id: str
    chunk_text: str
    similitud_sparse: float


class SparseChunkSearch(Protocol):
    """Búsqueda *sparse* del corpus (Milvus); la implementa ``MilvusRepository``. Mismo contrato de filtro que ``ChunkSearch``."""

    def search_sparse(
        self, vector: Mapping[int, float], limit: int, filtro: str | None = None
    ) -> list[ChunkEncontradoSparse]:
        """``filtro`` es el MISMO de la rama dense (``expresion_vigente_del_tipo()``, RN-05); sin él, solo ``is_current == true``."""
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


class QuerySparseEncoder(Protocol):
    """Vector *sparse* léxico de la CONSULTA (US-112 D6): mismo BGE-M3, pesos y ``SPARSE_VECTOR_SOURCE`` que la ingesta.

    Un texto sin ningún término con peso es un fallo (``FalloDeInferencia``): Milvus no admite un vector vacío.
    """

    def embeber_sparse(self, texto: str) -> Mapping[int, float]: ...


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


@dataclass(frozen=True)
class EvidenciaGenerada:
    """Lo que devuelve el generador: opciones con sus ``chunkId`` citados, aún sin validar (RN-01, RN-04)."""

    opciones: tuple[OpcionGenerada, ...]
    limitaciones_propuestas: tuple[str, ...] = ()
    """Limitaciones que propone el generador; siempre vacío en el S1 `[S1 resp. 11]` (las verifica L1D-180)."""


class EvidenceGenerator(Protocol):
    """Rama con evidencia sobre el umbral (prompt, LLM): la implementa L1D-275 (US-225).

    Entrega opciones crudas; las citas se validan y se completan desde el corpus en el servicio (L1D-179).
    """

    async def generar(
        self, solicitud: RagQueryInternalRequest, recuperacion: ResultadoDeRecuperacion
    ) -> EvidenciaGenerada: ...


class ApplicabilityTextProposer(Protocol):
    """Propone el valor de población que el texto de una fuente da a un criterio sin valor estructurado (US-123).

    Una sola llamada por consulta con todas las fuentes (design D2). Solo propone: la cita, el lenguaje y el soporte NLI
    los valida el servicio, y el estado lo asigna la regla del catálogo. Un fallo se propaga y la etapa lo traduce en
    ``503 LOCAL_LLM_UNAVAILABLE``."""

    async def proponer(
        self, fuentes: Sequence[FuenteParaProponer]
    ) -> tuple[PropuestaDePoblacion, ...]: ...


class CatalogoClinico(Protocol):
    """Catálogo clínico versionado y montado de solo lectura (``CLINICAL_CATALOG_PATH``), no el catálogo del corpus."""

    def version(self) -> str:
        """Versión efectiva del catálogo montado (la de su ``manifest.json``)."""
        ...

    def tipos_de_cancer(self) -> tuple[str, ...]:
        """Tipos de cáncer que declara el manifiesto (``cancerTypes``): contra ellos se valida ``ENABLED_CANCER_TYPES``."""
        ...


class CorpusCatalogReader(Protocol):
    """Fichas de fuente del catálogo (schema ``corpus``, rol ``rag_corpus``) para copiar los metadatos de las citas (RN-04)."""

    def fichas_por_documento(self, document_ids: Collection[str]) -> dict[str, FichaDeFuente]:
        """Solo devuelve los documentos que existen; un campo que el catálogo no registra es ``None``."""
        ...

    def poblacion_por_documento(
        self, document_ids: Collection[str]
    ) -> dict[str, PoblacionDelEstudio]:
        """``population_criteria`` y ``metadata_source`` (incluido ``pendiente``) de los documentos que existen.

        Solo lectura del schema ``corpus``; un documento inexistente no figura. Un fallo se propaga: el orquestador
        lo traduce en ``503 RETRIEVAL_UNAVAILABLE`` (nunca una población vacía disfrazada de «no reportado»)."""
        ...


@dataclass(frozen=True)
class PuertosDelCorpus:
    """Bordes del corpus (Milvus y schema ``corpus``) que se suman a los modelos para completar la recuperación."""

    buscador: ChunkSearch
    lector_release: CorpusReleaseReader
    catalogo: CorpusCatalogReader
    buscador_sparse: SparseChunkSearch | None = None
    """La rama *sparse* de la recuperación híbrida (US-112); ``None`` = el adapter del corpus no la ofrece."""


# --- Generación de /rag/query (US-225, L1D-275) ----------------------------------------------------------------------


class FalloDelLlm(RuntimeError):
    """El LLM local no respondió o no entregó una respuesta utilizable (conexión, tiempo, estado HTTP o cuerpo).

    Es el único error que los adapters del LLM lanzan; el generador lo convierte en ``503 LOCAL_LLM_UNAVAILABLE``.
    El mensaje nunca lleva el prompt, la pregunta ni el texto generado.
    """


class LlmClient(Protocol):
    """LLM local con salida JSON restringida por un esquema (RN-12: nunca un proveedor de nube con datos reales)."""

    async def completar_json(self, prompt: str, esquema: Mapping[str, Any]) -> str:
        """Texto crudo del modelo, que debe ser un JSON conforme a ``esquema``; sin reintento. Fallo: ``FalloDelLlm``."""
        ...


# --- Soporte NLI (US-231b; lo consume L1D-180) ---------------------------------------------------------------------


class NliClassifier(Protocol):
    """Clasifica pares (premisa, hipótesis) por lotes. Un fallo del modelo lanza ``FalloDeInferencia`` (L1D-180 lo
    traduce en ``503 NLI_UNAVAILABLE``); el mensaje nunca lleva la premisa ni la hipótesis."""

    @property
    def version(self) -> str:
        """``<modelo>@<revisión>#sha256:<hash>`` de la configuración, para ``meta.nliModel`` (FR-25)."""
        ...

    def clasificar(self, pares: list[ParNli]) -> list[ResultadoNli]:
        """Un resultado por par y en el mismo orden; la lista vacía devuelve ``[]`` sin invocar el modelo."""
        ...


# --- Lenguaje no prescriptivo de la salida generada (L1D-180, RN-23) ---------------------------------------


class ProhibitedTermsChecker(Protocol):
    """Términos prohibidos de nivel A en un texto GENERADO (RN-23). Los campos copiados del corpus no pasan por aquí."""

    @property
    def version(self) -> str:
        """``version`` de ``terminos-prohibidos.json`` cargada (``languagePolicyVersion`` del log)."""
        ...

    def reglas_coincidentes(self, texto: str, campo: CampoGenerado) -> tuple[str, ...]:
        """``id`` de cada regla que coincide con ``texto`` (``campo`` es uno de ``CAMPOS_GENERADOS``); vacío = limpio.

        Un campo que no es generado (copiado del corpus) nunca coincide. Nunca devuelve el término ni el texto.
        """
        ...


# --- Cobertura de metadatos de población del catálogo del corpus (US-132, M-08.3) --------------------------


@dataclass(frozen=True)
class CoberturaDePoblacion:
    """Documentos vigentes del catálogo y cuántos traen al menos un criterio de población (``is_current = true``)."""

    vigentes: int
    con_criterios: int


class LectorDeCoberturaDePoblacion(Protocol):
    """Lee del schema ``corpus`` (rol ``rag_corpus``) la cobertura de ``population_criteria`` de los documentos vigentes.

    Un fallo del catálogo lanza ``RecuperacionNoDisponibleError``: nunca una cobertura vacía disfrazada de «sin documentos»."""

    def cobertura(self) -> CoberturaDePoblacion: ...
