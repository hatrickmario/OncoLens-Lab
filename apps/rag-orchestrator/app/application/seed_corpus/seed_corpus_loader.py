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
    RegistroDeRelease,
    SourceFetcher,
)
from app.application.seed_corpus.registros import (
    chunks_del_documento,
    registro_embebido,
    registro_rechazado,
)
from app.application.seed_corpus.reporte import ReporteDeCarga, Resultado, ResultadoDeDocumento
from app.domain.corpus_seed.admisibilidad import (
    Admision,
    PoliticaDeLicencias,
    evaluar_admisibilidad,
)
from app.domain.corpus_seed.chunking import Tokenizador, fragmentar, normalizar_texto
from app.domain.corpus_seed.documento import DocumentoDeSemilla
from app.domain.corpus_seed.versionado import calcular_checksum


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
        resultados = tuple(self._procesar(documento) for documento in documentos)
        return ReporteDeCarga(resultados, self._publicar_release())

    def _procesar(self, documento: DocumentoDeSemilla) -> ResultadoDeDocumento:
        admision = evaluar_admisibilidad(documento, self._politica)
        if not admision.admitido:
            return self._rechazar(documento, admision)
        return self._cargar_documento(documento, admision)

    def _rechazar(self, documento: DocumentoDeSemilla, admision: Admision) -> ResultadoDeDocumento:
        self._catalogo.guardar_documento(registro_rechazado(documento, self._reloj.ahora()))
        motivo = admision.motivo.value if admision.motivo else None
        return ResultadoDeDocumento(documento.document_key, Resultado.RECHAZADO, motivo)

    def _cargar_documento(
        self, documento: DocumentoDeSemilla, admision: Admision
    ) -> ResultadoDeDocumento:
        ahora = self._reloj.ahora()
        texto = normalizar_texto(self._fuente.obtener_texto(documento))
        registro = registro_embebido(documento, admision, calcular_checksum(texto), ahora)
        fragmentos = fragmentar(
            texto, self._tokenizador, tamano=self._tamano_de_chunk, solape=self._solape_de_chunk
        )
        vectores = self._embedder.embeber(fragmentos)
        self._chunks.insert_chunks(chunks_del_documento(registro, fragmentos, vectores, ahora))
        self._catalogo.guardar_documento(registro)
        return ResultadoDeDocumento(
            documento.document_key, Resultado.CARGADO, chunks=len(fragmentos)
        )

    def _publicar_release(self) -> str | None:
        vigentes = self._catalogo.ids_de_documentos_vigentes()
        if not vigentes:
            return None
        release_id = self._ids.nuevo()
        self._catalogo.publicar_release(
            RegistroDeRelease(
                release_id=release_id,
                cutoff_date=self._fecha_de_corte,
                excluded_sources=self._politica.excluidas,
                published_at=self._reloj.ahora(),
                document_ids=tuple(sorted(vigentes)),
            )
        )
        return release_id
