"""Puertos propios de la ingesta en lote (US-117a, L1D-116).

La ingesta reutiliza los puertos de la semilla (``PassageEmbedder``, ``SourceFetcher``, ``ChunkStoreDeIngesta``,
``CorpusCatalog``) y añade el del vector *sparse* (``SparsePassageEncoder``), que ``ingest reindex-sparse`` (US-117b)
reutiliza, y el del almacén de la reindexación (``AlmacenDeReindexacionSparse``).
"""

from __future__ import annotations

from collections.abc import Collection, Iterator, Mapping, Sequence
from dataclasses import dataclass
from typing import Any, Protocol

from app.domain.corpus_metadata.resultado import MetadatosResueltos
from app.domain.corpus_seed.contexto_del_chunk import MetadatosDelContexto
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


# --- Contexto del documento en el texto que se embebe (US-279, L1D-337) -------------------------------------------


@dataclass(frozen=True)
class ResultadoDeContexto:
    """Los textos que entran a los codificadores (uno por chunk pedido, en el orden pedido) y cuántos chunks quedaron con el
    contexto determinista por una frase que el LLM no entregó: salida inválida o LLM no disponible, contados aparte."""

    textos: tuple[str, ...]
    respaldo_por_salida_invalida: int = 0
    respaldo_por_llm_no_disponible: int = 0


class ConstructorDeContexto(Protocol):
    """Decide el texto que se embebe de los chunks de UN documento según la variante de ``CORPUS_CHUNK_CONTEXT``.

    ``fragmentos`` son los chunks vigentes del documento en orden de índice y ``secciones`` su sección (misma longitud, o ``None``
    = documento sin secciones). ``pendientes`` son los índices de los chunks cuyo texto se pide (``None`` = todos): la
    reindexación reanudada no repite llamadas al LLM, pero el inicio del documento sale siempre de todos los fragmentos. No lanza
    por un fallo del LLM: ese chunk queda con el contexto determinista y se cuenta."""

    def textos_a_embeber(
        self,
        metadatos: MetadatosDelContexto | None,
        fragmentos: Sequence[str],
        *,
        secciones: Sequence[str] | None = None,
        pendientes: Sequence[int] | None = None,
    ) -> ResultadoDeContexto: ...


@dataclass(frozen=True)
class EntradaDelGeneradorDeContexto:
    """Lo único que el LLM recibe: metadatos del catálogo y el inicio del documento admitido (RN-21)."""

    metadatos: MetadatosDelContexto | None
    inicio_del_documento: str


MOTIVO_SALIDA_INVALIDA = "salida_invalida"
MOTIVO_LLM_NO_DISPONIBLE = "llm_no_disponible"


@dataclass(frozen=True)
class FraseDeContexto:
    """``frase`` es ``None`` cuando no hay una utilizable, y entonces ``motivo`` dice por qué; una cadena vacía nunca es una frase."""

    frase: str | None
    motivo: str | None = None


class GeneradorDeContextoDeChunk(Protocol):
    """Escribe una frase de contexto para un chunk con el LLM LOCAL (RN-12). Síncrono, como ``ResolutorDeMetadatos``: la CLI lo
    ejecuta con ``asyncio.run``. NUNCA lanza por un fallo del LLM: devuelve ``FraseDeContexto(None, motivo)``."""

    def generar(self, entrada: EntradaDelGeneradorDeContexto, chunk: str) -> FraseDeContexto: ...


@dataclass(frozen=True)
class ChunkDeOrigen:
    """Un chunk leído de la colección de origen: lo que la reindexación decide y la fila completa (opaca) para escribirla."""

    chunk_id: str
    document_id: str
    chunk_index: int
    section: str
    chunk_text: str
    is_current: bool
    registro: Mapping[str, Any]


class AlmacenDeReindexacionDeContexto(Protocol):
    """Lo que ``ingest reindex-context`` pide a una colección: leerla por páginas, saber qué ids tiene y escribir filas completas."""

    def listar_paginado(self, lote: int) -> Iterator[list[ChunkDeOrigen]]:
        """TODOS los chunks (vigentes o no) en páginas de ``lote`` como máximo, ordenados por ``chunk_id``, sin repetir ni omitir.

        ``lote`` fuera de ``0 < lote < LIMITE_DE_CONSULTA`` se rechaza con ``ValueError`` (antes de leer nada)."""
        ...

    def ids_presentes(self, chunk_ids: Collection[str]) -> frozenset[str]:
        """Los ``chunk_id`` de ``chunk_ids`` que la colección ya tiene."""
        ...

    def escribir_filas(self, filas: Sequence[Mapping[str, Any]]) -> int:
        """``upsert`` por ``chunk_id`` de filas completas (las que entregó ``listar_paginado`` de otra colección, con los vectores
        sustituidos). Devuelve cuántas escribió."""
        ...
