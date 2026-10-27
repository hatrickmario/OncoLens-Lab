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
    ChunkStoreDeIngesta,
    CorpusCatalog,
    IdGenerator,
    PassageEmbedder,
    RegistroDeDocumento,
    SourceFetcher,
)
from app.application.seed_corpus.nucleo_de_versionado import NucleoDeVersionado
from app.application.seed_corpus.registros import (
    chunks_del_documento,
    registro_con_error,
    registro_embebido,
)
from app.application.seed_corpus.release import publicar_release_si_cambio_el_conjunto_vigente
from app.application.seed_corpus.reporte import ReporteDeCarga, Resultado, ResultadoDeDocumento
from app.domain.corpus_metadata.origen import metadatos_sin_extraer
from app.domain.corpus_seed.admisibilidad import (
    Admision,
    PoliticaDeLicencias,
    evaluar_admisibilidad,
)
from app.domain.corpus_seed.chunking import Tokenizador, fragmentar, normalizar_texto
from app.domain.corpus_seed.documento import DocumentoDeSemilla
from app.domain.corpus_seed.errores import ChecksumDelManifiestoNoCoincide, TextoVacio
from app.domain.corpus_seed.versionado import (
    Accion,
    DecisionDeVersion,
    calcular_checksum,
    decidir_version,
)


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
        almacen_de_chunks: ChunkStoreDeIngesta,
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
        self._nucleo = NucleoDeVersionado(
            catalogo=catalogo, almacen_de_chunks=almacen_de_chunks, reloj=reloj
        )

    def cargar(self, documentos: Sequence[DocumentoDeSemilla]) -> ReporteDeCarga:
        resultados = tuple(self._procesar(documento) for documento in documentos)
        return ReporteDeCarga(resultados, self._publicar_release())

    def _procesar(self, documento: DocumentoDeSemilla) -> ResultadoDeDocumento:
        admision = evaluar_admisibilidad(documento, self._politica)
        if not admision.admitido:
            return self._rechazar(documento, admision)
        return self._cargar_documento(documento, admision)

    def _rechazar(self, documento: DocumentoDeSemilla, admision: Admision) -> ResultadoDeDocumento:
        """Rechazo por licencia o fuente: retira la vigente del grupo (RN-21, RN-05) y registra el rechazo, sin borrar nada.

        Solo el apagado de chunks (Milvus) se vuelve un resultado ``error``; un fallo del catálogo se propaga y aborta.
        """
        retiro = self._nucleo.planificar_retiro(documento)
        try:
            self._nucleo.apagar_chunks(retiro.a_apagar)
        except Exception as error:  # noqa: BLE001 - borde del puerto ChunkStoreDeIngesta (Milvus)
            # Error, no rechazado, y sin fila de rechazo: la siguiente carga repite el retiro desde cero.
            return ResultadoDeDocumento(
                documento.document_key, Resultado.ERROR, f"retiro: {type(error).__name__}"
            )
        retirada = self._nucleo.retirar_vigente_del_catalogo(retiro)
        motivo = self._nucleo.registrar_rechazo(documento, admision)
        return ResultadoDeDocumento(
            documento.document_key, Resultado.RECHAZADO, motivo, retirada_de_vigente=retirada
        )

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
        registro = registro_embebido(
            documento,
            admision,
            preparado.checksum,
            self._reloj.ahora(),
            metadatos_sin_extraer(documento),
        )
        try:
            vectores = self._embedder.embeber(fragmentos)
        except Exception as error:  # noqa: BLE001 - borde del puerto PassageEmbedder
            return self._registrar_error(
                documento, admision, preparado.checksum, "embeddings", error
            )
        # La fila definitiva (no vigente, estado error) ANTES de tocar Milvus: si algo falla después, el chunk tiene dueño.
        self._catalogo.guardar_documento(
            registro_con_error(documento, admision, preparado.checksum, self._reloj.ahora())
        )
        try:
            self._indexar(registro, fragmentos, vectores, preparado.decision)
        except Exception as error:  # noqa: BLE001 - borde del puerto ChunkStoreDeIngesta (Milvus)
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
        """Ya cargado: no se reinserta, pero se reconcilia Milvus con el catálogo (RN-05).

        Se apagan los chunks que un fallo previo dejó vigentes y se enciende la vigente del catálogo, cuyos chunks un fallo
        pudo dejar apagados. Si falla NO se escribe una fila ``error``: el documento embebido y vigente sigue siendo la verdad.
        """
        try:
            self._nucleo.reconciliar_omitido(decision)
        except Exception as error:  # noqa: BLE001 - borde del puerto ChunkStoreDeIngesta (Milvus)
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
        """Chunks nuevos -> apagar los de ``decision.a_apagar`` (D5). Idempotente: escribe por ``chunk_id``.

        Antes de llamarla existe en el catálogo la fila definitiva del documento (no vigente), así que todo chunk que llegue a
        Milvus tiene fila en su grupo y ``decidir_version``/``decidir_retiro`` lo ven. Entre escribir y apagar conviven
        chunks vigentes de dos versiones; si algo falla en la ventana, el catálogo conserva la versión anterior como vigente
        y la siguiente carga del grupo apaga lo que quedó. No hay garantía de coherencia entre la carga fallida y la
        siguiente (deuda: insertar con ``is_current = false`` y encender tras confirmar).
        """
        chunks = chunks_del_documento(registro, fragmentos, vectores, self._reloj.ahora())
        self._nucleo.escribir_y_apagar(chunks, decision)

    def _confirmar(
        self,
        documento: DocumentoDeSemilla,
        registro: RegistroDeDocumento,
        decision: DecisionDeVersion,
        n_chunks: int,
    ) -> ResultadoDeDocumento:
        """Último paso: el catálogo es la verdad (``is_current``); un fallo aquí aborta la carga."""
        reemplazo = self._nucleo.confirmar_version(registro, decision)
        resultado = Resultado.NUEVA_VERSION if reemplazo else Resultado.CARGADO
        return ResultadoDeDocumento(documento.document_key, resultado, chunks=n_chunks)

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
        return publicar_release_si_cambio_el_conjunto_vigente(
            self._catalogo, self._ids, self._reloj, self._politica, self._fecha_de_corte
        )
