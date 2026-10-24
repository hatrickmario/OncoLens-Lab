"""Caso de uso de la ingesta en lote reanudable del corpus (US-117a, L1D-116).

Admisibilidad -> texto -> checkpoint ``normalizado`` -> chunks -> dense + sparse -> Milvus -> ``embebido``. Cada etapa es
un método; las reglas viven en ``app/domain/corpus_seed`` y las E/S llegan por los puertos.

Un fallo de una etapa (``Exception`` en el borde de su puerto) deja ese documento en ``error`` y el lote sigue. Lo que NO
se captura: ``BaseException`` (``KeyboardInterrupt``, ``SystemExit``) y los fallos del catálogo, que abortan la ingesta.
"""

from __future__ import annotations

from collections.abc import Iterator, Sequence
from contextlib import contextmanager
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
    registro_con_error,
    registro_embebido,
    registro_normalizado,
    registro_rechazado,
)
from app.application.seed_corpus.release import publicar_release_si_cambio_el_conjunto_vigente
from app.application.seed_corpus.seed_corpus_loader import (
    ChecksumDelManifiestoNoCoincide,
    TextoVacio,
)
from app.domain.corpus_seed.admisibilidad import (
    Admision,
    PoliticaDeLicencias,
    evaluar_admisibilidad,
)
from app.domain.corpus_seed.chunking import Tokenizador, fragmentar, normalizar_texto
from app.domain.corpus_seed.documento import DocumentoDeSemilla
from app.domain.corpus_seed.versionado import (
    Accion,
    DecisionDeVersion,
    calcular_checksum,
    decidir_retiro,
    decidir_version,
    es_reanudacion,
)


class VectorSparseVacio(Exception):
    """El codificador *sparse* no devolvió un término para algún pasaje: Milvus lo rechazaría (US-117a, riesgos)."""


class FalloDeEtapa(Exception):
    """Una etapa de un documento falló: lleva el nombre de la etapa y la clase del error, nunca su mensaje."""

    def __init__(self, etapa: str, causa: Exception) -> None:
        super().__init__(etapa)
        self.etapa = etapa
        self.clase = type(causa).__name__


@contextmanager
def _etapa(nombre: str) -> Iterator[None]:
    try:
        yield
    except FalloDeEtapa:
        raise
    except Exception as error:  # noqa: BLE001 - borde de un puerto: lo que falle es de este documento
        raise FalloDeEtapa(nombre, error) from None


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
        try:
            with _etapa("retiro"):
                self._apagar(retiro.a_apagar)
        except FalloDeEtapa as fallo:
            # Error y sin fila de rechazo: la siguiente ingesta repite el retiro desde cero.
            return _resultado_de_error(documento, fallo)
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
        try:
            texto, checksum = self._leer_y_normalizar(documento)
        except FalloDeEtapa as fallo:
            return self._registrar_error(documento, admision, None, fallo)
        try:
            return self._ingerir_texto(documento, admision, texto, checksum)
        except FalloDeEtapa as fallo:
            return self._registrar_error(documento, admision, checksum, fallo)

    def _leer_y_normalizar(self, documento: DocumentoDeSemilla) -> tuple[str, str]:
        """Texto íntegro y normalizado con su ``checksum``. Un texto que no es UTF-8 falla en ``normalizacion``."""
        with _etapa("obtener_texto"):
            crudo = self._obtener_texto(documento)
        with _etapa("normalizacion"):
            texto = normalizar_texto(crudo)
        checksum = calcular_checksum(texto)
        if documento.checksum_esperado not in (None, checksum):
            with _etapa("integridad"):
                raise ChecksumDelManifiestoNoCoincide()
        return texto, checksum

    def _obtener_texto(self, documento: DocumentoDeSemilla) -> str:
        try:
            return self._fuente.obtener_texto(documento)
        except UnicodeDecodeError as error:
            raise FalloDeEtapa("normalizacion", error) from None

    def _ingerir_texto(
        self, documento: DocumentoDeSemilla, admision: Admision, texto: str, checksum: str
    ) -> ResultadoDeIngesta:
        versiones = self._catalogo.versiones_del_grupo(documento.version_group_id)
        decision = decidir_version(checksum, versiones)
        if decision.accion is Accion.OMITIR:
            return self._omitir(documento, decision)
        reanudado = es_reanudacion(checksum, versiones)
        fragmentos = self._fragmentar(texto)
        self._catalogo.guardar_documento(
            registro_normalizado(documento, admision, checksum, self._reloj.ahora())
        )
        vectores = self._embeber(fragmentos)
        vectores_sparse = self._codificar_sparse(fragmentos)
        registro = registro_embebido(documento, admision, checksum, self._reloj.ahora())
        with _etapa("milvus"):
            self._indexar(registro, fragmentos, vectores, vectores_sparse, decision)
        self._confirmar(registro, decision)
        return ResultadoDeIngesta(
            documento.document_key, Estado.EMBEBIDO, chunks=len(fragmentos), reanudado=reanudado
        )

    def _fragmentar(self, texto: str) -> list[str]:
        fragmentos = fragmentar(
            texto, self._tokenizador, tamano=self._tamano_de_chunk, solape=self._solape_de_chunk
        )
        if not fragmentos:
            with _etapa("texto"):
                raise TextoVacio()
        return fragmentos

    def _embeber(self, fragmentos: Sequence[str]) -> list[list[float]]:
        with _etapa("embeddings"):
            return self._embedder.embeber(fragmentos)

    def _codificar_sparse(self, fragmentos: Sequence[str]) -> list[dict[int, float]]:
        """Un vector *sparse* no vacío por fragmento: sin él el documento queda en error, nunca se inserta sin *sparse*."""
        with _etapa("sparse"):
            vectores = self._codificador_sparse.codificar(fragmentos)
            if len(vectores) != len(fragmentos) or not all(vectores):
                raise VectorSparseVacio()
        return vectores

    def _omitir(
        self, documento: DocumentoDeSemilla, decision: DecisionDeVersion
    ) -> ResultadoDeIngesta:
        """Ya embebido con ese contenido: no se re-embebe, pero se reconcilia Milvus con el catálogo (RN-05)."""
        try:
            with _etapa("milvus"):
                self._apagar(decision.a_apagar)
                if decision.a_encender is not None:
                    self._almacen_de_chunks.marcar_vigentes(decision.a_encender)
        except FalloDeEtapa as fallo:
            # Sin fila de error: el documento embebido y vigente sigue siendo la verdad del catálogo.
            return _resultado_de_error(documento, fallo)
        return ResultadoDeIngesta(documento.document_key, Estado.OMITIDO)

    def _indexar(
        self,
        registro: RegistroDeDocumento,
        fragmentos: Sequence[str],
        vectores: Sequence[Sequence[float]],
        vectores_sparse: Sequence[dict[int, float]],
        decision: DecisionDeVersion,
    ) -> None:
        """Escribe por ``chunk_id`` determinista (reprocesar reescribe, nunca duplica) y apaga lo que reemplaza."""
        chunks = chunks_del_documento(
            registro, fragmentos, vectores, self._reloj.ahora(), vectores_sparse
        )
        self._almacen_de_chunks.upsert_chunks(chunks)
        self._apagar(decision.a_apagar)

    def _apagar(self, document_ids: Sequence[str]) -> None:
        for document_id in document_ids:
            self._almacen_de_chunks.marcar_no_vigentes(document_id)

    def _confirmar(self, registro: RegistroDeDocumento, decision: DecisionDeVersion) -> None:
        """Último paso: el catálogo es la verdad (``embebido`` + ``is_current``). Un reemplazo marca la anterior no vigente."""
        if decision.anterior_id is None:
            self._catalogo.guardar_documento(registro)
        else:
            self._catalogo.reemplazar_version(registro, decision.anterior_id, self._reloj.ahora())

    def _registrar_error(
        self,
        documento: DocumentoDeSemilla,
        admision: Admision,
        checksum: str | None,
        fallo: FalloDeEtapa,
    ) -> ResultadoDeIngesta:
        """``status = error`` y no vigente en el catálogo; el reporte lleva etapa y clase, nunca el mensaje (puede traer URLs)."""
        self._catalogo.guardar_documento(
            registro_con_error(documento, admision, checksum, self._reloj.ahora())
        )
        return _resultado_de_error(documento, fallo)


def _resultado_de_error(documento: DocumentoDeSemilla, fallo: FalloDeEtapa) -> ResultadoDeIngesta:
    return ResultadoDeIngesta(documento.document_key, Estado.ERROR, f"{fallo.etapa}: {fallo.clase}")
