"""Caso de uso de la ingesta en lote reanudable del corpus (US-117a, L1D-116).

Admisibilidad -> texto -> checkpoint ``normalizado`` -> chunks -> dense + sparse -> Milvus -> ``embebido``. Cada etapa es
un método; las reglas viven en ``app/domain/corpus_seed`` y las E/S llegan por los puertos.
"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import date

from app.application.corpus_ingestion.ports import SparsePassageEncoder
from app.application.corpus_ingestion.reporte import (
    Estado,
    ReporteDeIngesta,
    ResultadoDeIngesta,
)
from app.application.ports import Clock
from app.application.seed_corpus.ports import (
    ChunkStoreDeIngesta,
    CorpusCatalog,
    IdGenerator,
    PassageEmbedder,
    RegistroDeDocumento,
    SourceFetcher,
)
from app.application.seed_corpus.registros import (
    chunks_del_documento,
    registro_embebido,
    registro_normalizado,
    registro_rechazado,
)
from app.application.seed_corpus.release import publicar_release_si_cambio_el_conjunto_vigente
from app.domain.corpus_seed.admisibilidad import (
    Admision,
    PoliticaDeLicencias,
    evaluar_admisibilidad,
)
from app.domain.corpus_seed.chunking import Tokenizador, fragmentar, normalizar_texto
from app.domain.corpus_seed.documento import DocumentoDeSemilla
from app.domain.corpus_seed.versionado import calcular_checksum, decidir_version, decidir_retiro


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
        resultados = tuple(self._procesar(documento) for documento in documentos)
        release_id = publicar_release_si_cambio_el_conjunto_vigente(
            self._catalogo, self._ids, self._reloj, self._politica, self._fecha_de_corte
        )
        return ReporteDeIngesta(resultados, release_id)

    def _procesar(self, documento: DocumentoDeSemilla) -> ResultadoDeIngesta:
        admision = evaluar_admisibilidad(documento, self._politica)
        if not admision.admitido:
            return self._rechazar(documento, admision)
        return self._ingerir_documento(documento, admision)

    def _rechazar(self, documento: DocumentoDeSemilla, admision: Admision) -> ResultadoDeIngesta:
        """Rechazo por licencia o fuente (RN-21): retira la vigente del grupo sin borrar nada (RN-05) y registra el rechazo."""
        retiro = decidir_retiro(self._catalogo.versiones_del_grupo(documento.version_group_id))
        for document_id in retiro.a_apagar:
            self._almacen_de_chunks.marcar_no_vigentes(document_id)
        if retiro.vigente_id is not None:
            self._catalogo.retirar_version(retiro.vigente_id, self._reloj.ahora())
        self._catalogo.guardar_documento(registro_rechazado(documento, self._reloj.ahora()))
        motivo = admision.motivo.value if admision.motivo else None
        return ResultadoDeIngesta(
            documento.document_key,
            Estado.RECHAZADO_LICENCIA,
            motivo,
            retirada_de_vigente=retiro.vigente_id is not None,
        )

    def _ingerir_documento(
        self, documento: DocumentoDeSemilla, admision: Admision
    ) -> ResultadoDeIngesta:
        texto = normalizar_texto(self._fuente.obtener_texto(documento))
        checksum = calcular_checksum(texto)
        decision = decidir_version(
            checksum, self._catalogo.versiones_del_grupo(documento.version_group_id)
        )
        fragmentos = fragmentar(
            texto, self._tokenizador, tamano=self._tamano_de_chunk, solape=self._solape_de_chunk
        )
        self._catalogo.guardar_documento(
            registro_normalizado(documento, admision, checksum, self._reloj.ahora())
        )
        vectores = self._embedder.embeber(fragmentos)
        vectores_sparse = self._codificador_sparse.codificar(fragmentos)
        registro = registro_embebido(documento, admision, checksum, self._reloj.ahora())
        self._indexar(registro, fragmentos, vectores, vectores_sparse)
        self._catalogo.guardar_documento(registro)
        return ResultadoDeIngesta(documento.document_key, Estado.EMBEBIDO, chunks=len(fragmentos))

    def _indexar(
        self,
        registro: RegistroDeDocumento,
        fragmentos: Sequence[str],
        vectores: Sequence[Sequence[float]],
        vectores_sparse: Sequence[dict[int, float]],
    ) -> None:
        """Escribe por ``chunk_id`` determinista: reprocesar un documento reescribe sus chunks, nunca los duplica."""
        chunks = chunks_del_documento(
            registro, fragmentos, vectores, self._reloj.ahora(), vectores_sparse
        )
        self._almacen_de_chunks.upsert_chunks(chunks)
