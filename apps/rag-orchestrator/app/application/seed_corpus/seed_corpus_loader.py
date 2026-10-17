"""Caso de uso del cargador de la semilla del corpus (US-059, L1D-115).

Admisibilidad -> texto -> versión -> chunks -> embeddings -> Milvus -> catálogo -> release. Cada etapa es un método;
las reglas viven en ``app/domain/corpus_seed`` y las E/S llegan por los puertos de ``ports.py``.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date

from app.application.ports import Clock
from app.application.seed_corpus.ports import (
    ChunkStore,
    CorpusCatalog,
    IdGenerator,
    PassageEmbedder,
    RegistroDeDocumento,
    RegistroDeRelease,
    SourceFetcher,
)
from app.application.seed_corpus.registros import (
    chunks_del_documento,
    registro_con_error,
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
from app.domain.corpus_seed.versionado import (
    Accion,
    DecisionDeVersion,
    calcular_checksum,
    debe_publicar_release,
    decidir_retiro,
    decidir_version,
)


class ChecksumDelManifiestoNoCoincide(Exception):
    """El texto leído no es el que el manifiesto declaró (``checksum``): se alteró o es otra versión."""


class TextoVacio(Exception):
    """El documento no tiene texto que indexar tras normalizarlo."""


@dataclass(frozen=True)
class _Preparado:
    """Un documento admitido cuyo texto se leyó íntegro y cuya versión pide trabajo (no es un duplicado)."""

    texto: str
    checksum: str
    decision: DecisionDeVersion


class SeedCorpusLoader:
    def __init__(
        self,
        *,
        catalogo: CorpusCatalog,
        almacen_de_chunks: ChunkStore,
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
        self._almacen_de_chunks = almacen_de_chunks
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
        """Rechazo por licencia o fuente: retira la vigente del grupo (RN-21, RN-05) y registra el rechazo, sin borrar nada."""
        try:
            retirada = self._retirar_vigente_del_grupo(documento)
        except Exception as error:  # noqa: BLE001 - borde del puerto ChunkStore (Milvus)
            # Error, no rechazado, y sin fila de rechazo: la siguiente carga repite el retiro desde cero.
            return ResultadoDeDocumento(
                documento.document_key, Resultado.ERROR, f"retiro: {type(error).__name__}"
            )
        self._catalogo.guardar_documento(registro_rechazado(documento, self._reloj.ahora()))
        motivo = admision.motivo.value if admision.motivo else None
        return ResultadoDeDocumento(
            documento.document_key, Resultado.RECHAZADO, motivo, retirada_de_vigente=retirada
        )

    def _retirar_vigente_del_grupo(self, documento: DocumentoDeSemilla) -> bool:
        """Apaga en Milvus y luego retira en el catálogo la versión vigente del grupo; ``True`` si había una.

        Orden de D5: primero los chunks (si falla, el catálogo sigue diciendo "vigente" y el contenido solo se pierde en
        parte, nunca se sirve contenido retirado), después el catálogo.
        """
        retiro = decidir_retiro(self._catalogo.versiones_del_grupo(documento.version_group_id))
        self._apagar(retiro.a_apagar)
        if retiro.vigente_id is None:
            return False
        self._catalogo.retirar_version(retiro.vigente_id, self._reloj.ahora())
        return True

    def _cargar_documento(
        self, documento: DocumentoDeSemilla, admision: Admision
    ) -> ResultadoDeDocumento:
        preparado = self._preparar(documento, admision)
        if isinstance(preparado, ResultadoDeDocumento):
            return preparado
        fragmentos = fragmentar(
            preparado.texto,
            self._tokenizador,
            tamano=self._tamano_de_chunk,
            solape=self._solape_de_chunk,
        )
        if not fragmentos:
            return self._registrar_error(
                documento, admision, preparado.checksum, "texto", TextoVacio()
            )
        registro = registro_embebido(documento, admision, preparado.checksum, self._reloj.ahora())
        try:
            vectores = self._embedder.embeber(fragmentos)
        except Exception as error:  # noqa: BLE001 - borde del puerto PassageEmbedder
            return self._registrar_error(
                documento, admision, preparado.checksum, "embeddings", error
            )
        try:
            self._indexar(registro, fragmentos, vectores, preparado.decision)
        except Exception as error:  # noqa: BLE001 - borde del puerto ChunkStore (Milvus)
            return self._registrar_error(documento, admision, preparado.checksum, "milvus", error)
        return self._confirmar(documento, registro, preparado.decision, len(fragmentos))

    def _preparar(
        self, documento: DocumentoDeSemilla, admision: Admision
    ) -> _Preparado | ResultadoDeDocumento:
        """Texto leído e íntegro y qué hacer con su versión; si el documento ya no sigue, el resultado que lo cierra."""
        try:
            texto = normalizar_texto(self._fuente.obtener_texto(documento))
        except Exception as error:  # noqa: BLE001 - borde del puerto SourceFetcher: lo que falle es de este documento
            return self._registrar_error(documento, admision, None, "obtener_texto", error)
        checksum = calcular_checksum(texto)
        if documento.checksum_esperado not in (None, checksum):
            return self._registrar_error(
                documento, admision, None, "integridad", ChecksumDelManifiestoNoCoincide()
            )
        versiones = self._catalogo.versiones_del_grupo(documento.version_group_id)
        decision = decidir_version(checksum, versiones)
        if decision.accion is Accion.OMITIR:
            return self._omitir(documento, decision)
        return _Preparado(texto, checksum, decision)

    def _omitir(
        self, documento: DocumentoDeSemilla, decision: DecisionDeVersion
    ) -> ResultadoDeDocumento:
        """Ya cargado: no se reinserta, pero se apagan los chunks que un fallo previo dejó vigentes (RN-05).

        Si apagarlos falla NO se escribe una fila ``error``: el documento embebido y vigente sigue siendo la verdad.
        """
        try:
            self._apagar(decision.a_apagar)
        except Exception as error:  # noqa: BLE001 - borde del puerto ChunkStore (Milvus)
            return ResultadoDeDocumento(
                documento.document_key, Resultado.ERROR, f"milvus: {type(error).__name__}"
            )
        return ResultadoDeDocumento(documento.document_key, Resultado.OMITIDO)

    def _indexar(
        self,
        registro: RegistroDeDocumento,
        fragmentos: Sequence[str],
        vectores: Sequence[Sequence[float]],
        decision: DecisionDeVersion,
    ) -> None:
        """Chunks nuevos -> apagar los de ``decision.a_apagar`` (D5). Re-ejecutable: no reinserta lo que ya quedó.

        Entre insertar y apagar hay una ventana en la que conviven chunks vigentes de dos versiones; si algo falla en ella,
        el catálogo conserva la versión anterior como vigente y la siguiente carga del grupo apaga lo que quedó
        (``a_apagar`` incluye toda versión no ``embebido``). No hay garantía de que Milvus y el catálogo coincidan entre
        una carga fallida y la siguiente (deuda: insertar con ``is_current = false`` y encender tras confirmar).
        """
        ya_insertados = self._almacen_de_chunks.ids_de_chunks_del_documento(registro.document_id)
        chunks = chunks_del_documento(registro, fragmentos, vectores, self._reloj.ahora())
        pendientes = [c for c in chunks if c.chunk_id not in ya_insertados]
        if pendientes:
            self._almacen_de_chunks.insert_chunks(pendientes)
        self._apagar(decision.a_apagar)

    def _apagar(self, document_ids: Sequence[str]) -> None:
        for document_id in document_ids:
            self._almacen_de_chunks.marcar_no_vigentes(document_id)

    def _confirmar(
        self,
        documento: DocumentoDeSemilla,
        registro: RegistroDeDocumento,
        decision: DecisionDeVersion,
        n_chunks: int,
    ) -> ResultadoDeDocumento:
        """Último paso: el catálogo es la verdad (``is_current``); un fallo aquí aborta la carga."""
        if decision.anterior_id is None:
            self._catalogo.guardar_documento(registro)
            return ResultadoDeDocumento(documento.document_key, Resultado.CARGADO, chunks=n_chunks)
        self._catalogo.reemplazar_version(registro, decision.anterior_id, self._reloj.ahora())
        return ResultadoDeDocumento(
            documento.document_key, Resultado.NUEVA_VERSION, chunks=n_chunks
        )

    def _registrar_error(
        self,
        documento: DocumentoDeSemilla,
        admision: Admision,
        checksum: str | None,
        etapa: str,
        error: Exception,
    ) -> ResultadoDeDocumento:
        """``status = error``, no vigente en el catálogo; sus chunks pudieron quedar en Milvus y los apaga la siguiente carga del grupo.

        El reporte lleva etapa y clase, nunca el mensaje de la excepción (puede traer URLs).
        """
        registro = registro_con_error(documento, admision, checksum, self._reloj.ahora())
        self._catalogo.guardar_documento(registro)
        return ResultadoDeDocumento(
            documento.document_key, Resultado.ERROR, f"{etapa}: {type(error).__name__}"
        )

    def _publicar_release(self) -> str | None:
        vigentes = self._catalogo.ids_de_documentos_vigentes()
        if not debe_publicar_release(vigentes, self._catalogo.ids_de_la_ultima_release()):
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
