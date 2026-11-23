"""Ingesta del brazo de chunks de 512 tokens del reranker (US-278, ``[S7 resp. 14]``): los mismos documentos, otra colección.

Fragmenta de nuevo los documentos que la ingesta de ``l1d-119`` dejó vigentes (mismo manifiesto, mismo texto normalizado, mismo
``document_id``) y escribe SOLO en una colección de Milvus propia. El catálogo ``corpus`` entra por su puerto de LECTURA
(``LectorDePoblacionDelCorpus``: no tiene ningún método de escritura) y el almacén recibido es el de la colección nueva, así que ni
el catálogo compartido ni la colección de origen se tocan (RN-05). Los metadatos de cada chunk se COPIAN del registro del catálogo
(RN-04, RN-25): no hay LLM ni NLI. Es una ingesta aparte, no ``reindex-context`` de ``l1d-337``: aquí cambian los límites de los
chunks. Un documento que falla deja un error por etapa y la clase (nunca el mensaje) y el lote sigue.
"""

from __future__ import annotations

from collections.abc import Iterator, Sequence
from contextlib import contextmanager
from dataclasses import dataclass

from app.application.corpus_ingestion.ports import SparsePassageEncoder
from app.application.ports import Clock
from app.application.seed_corpus.ports import (
    ChunkStoreDeIngesta,
    LectorDePoblacionDelCorpus,
    PassageEmbedder,
    RegistroDeDocumento,
    SourceFetcher,
)
from app.application.seed_corpus.registros import chunks_del_documento, identificador_de_documento
from app.domain.corpus_seed.chunking import (
    Tokenizador,
    fragmentar,
    normalizar_texto,
    validar_ventana,
)
from app.domain.corpus_seed.documento import DocumentoDeSemilla
from app.domain.corpus_seed.errores import TextoVacio
from app.domain.corpus_seed.sparse import exigir_sparse_por_pasaje
from app.domain.corpus_seed.versionado import calcular_checksum

MOTIVO_SIN_REGISTRO = "sin_registro_vigente"


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


class _FalloDeEtapa(Exception):
    def __init__(self, etapa: str, causa: Exception) -> None:
        super().__init__(etapa)
        self.etapa, self.clase = etapa, type(causa).__name__


@contextmanager
def _etapa(nombre: str) -> Iterator[None]:
    """Lo que falle en una etapa de UN documento sale como etapa y clase: el mensaje puede traer texto o una URI."""
    try:
        yield
    except _FalloDeEtapa:
        raise
    except Exception as error:  # noqa: BLE001 - borde de un puerto: el fallo es de este documento
        raise _FalloDeEtapa(nombre, error) from None


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
        validar_ventana(tamano_de_chunk, solape_de_chunk)
        self._catalogo = catalogo
        self._fuente = fuente
        self._almacen = almacen
        self._embedder = embedder
        self._codificador_sparse = codificador_sparse
        self._tokenizador = tokenizador
        self._tamano_de_chunk = tamano_de_chunk
        self._solape_de_chunk = solape_de_chunk
        self._reloj = reloj

    def ingerir(self, documentos: Sequence[DocumentoDeSemilla]) -> ReporteDelBrazo:
        """Un resultado por documento del manifiesto. El catálogo se lee una vez; un fallo suyo aborta (no es de un documento)."""
        vigentes = {r.document_id: r for r in self._catalogo.documentos_vigentes_con_poblacion()}
        return ReporteDelBrazo(tuple(self._procesar(d, vigentes) for d in documentos))

    def _procesar(
        self, documento: DocumentoDeSemilla, vigentes: dict[str, RegistroDeDocumento]
    ) -> ResultadoDelBrazo:
        try:
            return self._ingerir_documento(documento, vigentes)
        except _FalloDeEtapa as fallo:
            return ResultadoDelBrazo(documento.document_key, error=f"{fallo.etapa}: {fallo.clase}")

    def _ingerir_documento(
        self, documento: DocumentoDeSemilla, vigentes: dict[str, RegistroDeDocumento]
    ) -> ResultadoDelBrazo:
        with _etapa("normalizacion"):
            texto = normalizar_texto(self._fuente.obtener_texto(documento))
        registro = vigentes.get(
            identificador_de_documento(documento.document_key, calcular_checksum(texto))
        )
        if (
            registro is None
        ):  # solo entra lo que la ingesta de origen dejó vigente: no se inventan metadatos (RN-25)
            return ResultadoDelBrazo(documento.document_key, omitido=MOTIVO_SIN_REGISTRO)
        with _etapa("chunking"):
            fragmentos = fragmentar(
                texto, self._tokenizador, tamano=self._tamano_de_chunk, solape=self._solape_de_chunk
            )
            if not fragmentos:
                raise TextoVacio()
        with _etapa("embeddings"):
            vectores = self._embedder.embeber(fragmentos)
        with _etapa("sparse"):
            sparse = exigir_sparse_por_pasaje(
                self._codificador_sparse.codificar(fragmentos), len(fragmentos)
            )
        with _etapa("milvus"):
            chunks = chunks_del_documento(
                registro, fragmentos, vectores, self._reloj.ahora(), sparse
            )
            self._almacen.upsert_chunks(chunks)
        return ResultadoDelBrazo(documento.document_key, chunks=len(chunks))
