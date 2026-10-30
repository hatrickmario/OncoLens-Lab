"""Caso de uso de la ingesta en lote reanudable del corpus (US-117a, L1D-116).

Admisibilidad -> texto -> checkpoint ``normalizado`` -> chunks -> dense + sparse -> metadatos (US-118) -> Milvus ->
``embebido``. Cada etapa es un método; las reglas viven en ``app/domain/corpus_seed`` y ``corpus_metadata`` y las E/S
llegan por los puertos.

Un fallo de una etapa (``Exception`` en el borde de su puerto) deja ese documento en ``error`` y el lote sigue. Lo que NO
se captura: ``BaseException`` (``KeyboardInterrupt``, ``SystemExit``) y los fallos del catálogo, que abortan la ingesta.
"""

from __future__ import annotations

from collections.abc import Iterator, Sequence
from contextlib import contextmanager
from datetime import date

from app.application.corpus_ingestion.ports import ResolutorDeMetadatos, SparsePassageEncoder
from app.application.corpus_ingestion.reporte import (
    Estado,
    ReporteDeIngesta,
    ResultadoDeIngesta,
)
from app.application.corpus_metadata.poblacion_puertos import (
    AlmacenDePoblacion,
    DocumentoParaExtraer,
    ExtractorDePoblacion,
    Fragmento,
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
from app.application.seed_corpus.nucleo_de_versionado import NucleoDeVersionado
from app.application.seed_corpus.registros import (
    chunks_del_documento,
    identificador_de_chunk,
    identificador_de_documento,
    registro_con_error,
    registro_embebido,
    registro_normalizado,
)
from app.application.seed_corpus.release import publicar_release_si_cambio_el_conjunto_vigente
from app.domain.corpus_metadata.poblacion_contadores import ContadoresDePoblacion
from app.domain.corpus_metadata.poblacion_escritura import integrar_poblacion_en_abanico
from app.domain.corpus_metadata.resultado import EXTRAIDO_VERIFICADO, MetadatosResueltos
from app.domain.corpus_seed.admisibilidad import (
    Admision,
    PoliticaDeLicencias,
    evaluar_admisibilidad,
)
from app.domain.corpus_seed.chunking import Tokenizador, fragmentar, normalizar_texto
from app.domain.corpus_seed.documento import DocumentoDeSemilla
from app.domain.corpus_seed.errores import (
    ChecksumDelManifiestoNoCoincide,
    TextoVacio,
)
from app.domain.corpus_seed.sparse import exigir_sparse_por_pasaje
from app.domain.corpus_seed.versionado import (
    Accion,
    DecisionDeVersion,
    calcular_checksum,
    decidir_version,
    es_reanudacion,
)


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
        resolutor_de_metadatos: ResolutorDeMetadatos,
        fuente: SourceFetcher,
        reloj: Clock,
        ids: IdGenerator,
        politica: PoliticaDeLicencias,
        tokenizador: Tokenizador,
        tamano_de_chunk: int,
        solape_de_chunk: int,
        fecha_de_corte: date,
        extractor_de_poblacion: ExtractorDePoblacion | None = None,
        almacen_de_poblacion: AlmacenDePoblacion | None = None,
    ) -> None:
        self._extractor_de_poblacion = extractor_de_poblacion
        self._almacen_de_poblacion = almacen_de_poblacion
        self._catalogo = catalogo
        self._almacen_de_chunks = almacen_de_chunks
        self._embedder = embedder
        self._codificador_sparse = codificador_sparse
        self._resolutor_de_metadatos = resolutor_de_metadatos
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
        retiro = self._nucleo.planificar_retiro(documento)
        try:
            with _etapa("retiro"):
                self._nucleo.apagar_chunks(retiro.a_apagar)
        except FalloDeEtapa as fallo:
            # Error y sin fila de rechazo: la siguiente ingesta repite el retiro desde cero.
            return _resultado_de_error(documento, fallo)
        retirada = self._nucleo.retirar_vigente_del_catalogo(retiro)
        motivo = self._nucleo.registrar_rechazo(documento, admision)
        return ResultadoDeIngesta(
            documento.document_key,
            Estado.RECHAZADO_LICENCIA,
            motivo,
            retirada_de_vigente=retirada,
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
            return self._omitir(documento, decision, texto, checksum)
        reanudado = es_reanudacion(checksum, versiones)
        fragmentos = self._fragmentar(texto)
        self._catalogo.guardar_documento(
            registro_normalizado(documento, admision, checksum, self._reloj.ahora())
        )
        vectores = self._embeber(fragmentos)
        vectores_sparse = self._codificar_sparse(fragmentos)
        document_id = identificador_de_documento(documento.document_key, checksum)
        metadatos = self._resolver_metadatos(documento, texto, fragmentos)
        metadatos, poblacion = self._extraer_poblacion(
            documento, document_id, fragmentos, metadatos
        )
        registro = registro_embebido(documento, admision, checksum, self._reloj.ahora(), metadatos)
        with _etapa("milvus"):
            self._indexar(registro, fragmentos, vectores, vectores_sparse, decision)
        self._confirmar(registro, decision)
        return ResultadoDeIngesta(
            documento.document_key,
            Estado.EMBEBIDO,
            chunks=len(fragmentos),
            reanudado=reanudado,
            metadatos=metadatos,
            document_id=registro.document_id,
            poblacion=poblacion,
        )

    def _fragmentar(self, texto: str) -> list[str]:
        fragmentos = fragmentar(
            texto, self._tokenizador, tamano=self._tamano_de_chunk, solape=self._solape_de_chunk
        )
        if not fragmentos:
            with _etapa("texto"):
                raise TextoVacio()
        return fragmentos

    def _resolver_metadatos(
        self, documento: DocumentoDeSemilla, texto: str, fragmentos: Sequence[str]
    ) -> MetadatosResueltos:
        """Los fallos del LLM y del NLI ya vuelven como ``pendiente``; un defecto del resolutor deja SOLO este documento en
        ``error`` (etapa ``metadatos``) y el lote sigue."""
        with _etapa("metadatos"):
            return self._resolutor_de_metadatos.resolver(documento, texto, fragmentos)

    def _extraer_poblacion(
        self,
        documento: DocumentoDeSemilla,
        document_id: str,
        fragmentos: Sequence[str],
        metadatos: MetadatosResueltos,
    ) -> tuple[MetadatosResueltos, ContadoresDePoblacion | None]:
        """La población del estudio en abanico (US-242, D8): solo si la extracción de metadatos corrió (si cayó, el documento
        queda ``pendiente`` y no se gastan más llamadas). Un fallo del LLM o del NLI deja SOLO ese criterio ``pendiente``;
        un defecto del extractor deja SOLO este documento en ``error`` (etapa ``poblacion``)."""
        if self._extractor_de_poblacion is None or metadatos.metadata_source != EXTRAIDO_VERIFICADO:
            return metadatos, None
        with _etapa("poblacion"):
            extraida = self._extractor_de_poblacion.extraer(
                _documento_para_extraer(documento, document_id, fragmentos),
                documento.cancer_type_tags,
                None,
            )
            integrada = integrar_poblacion_en_abanico(metadatos, extraida.population_criteria)
        return integrada, extraida.contadores

    def _embeber(self, fragmentos: Sequence[str]) -> list[list[float]]:
        with _etapa("embeddings"):
            return self._embedder.embeber(fragmentos)

    def _codificar_sparse(self, fragmentos: Sequence[str]) -> list[dict[int, float]]:
        """Un vector *sparse* no vacío por fragmento: sin él el documento queda en error, nunca se inserta sin *sparse*."""
        with _etapa("sparse"):
            vectores = self._codificador_sparse.codificar(fragmentos)
            return list(exigir_sparse_por_pasaje(vectores, len(fragmentos)))

    def _omitir(
        self, documento: DocumentoDeSemilla, decision: DecisionDeVersion, texto: str, checksum: str
    ) -> ResultadoDeIngesta:
        """Ya embebido con ese contenido: no se re-embebe, pero se reconcilia Milvus con el catálogo (RN-05)."""
        try:
            with _etapa("milvus"):
                self._nucleo.reconciliar_omitido(decision)
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
        self._nucleo.escribir_y_apagar(chunks, decision)

    def _confirmar(self, registro: RegistroDeDocumento, decision: DecisionDeVersion) -> None:
        """Último paso: el catálogo es la verdad (``embebido`` + ``is_current``). Un reemplazo marca la anterior no vigente."""
        self._nucleo.confirmar_version(registro, decision)

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


def _documento_para_extraer(
    documento: DocumentoDeSemilla, document_id: str, fragmentos: Sequence[str]
) -> DocumentoParaExtraer:
    """Los fragmentos llevan el ``chunk_id`` que Milvus indexará (``identificador_de_chunk``): la cita es verificable (RN-04)."""
    return DocumentoParaExtraer(
        documento.document_key,
        document_id,
        tuple(
            Fragmento(identificador_de_chunk(document_id, i), f) for i, f in enumerate(fragmentos)
        ),
    )


def _resultado_de_error(documento: DocumentoDeSemilla, fallo: FalloDeEtapa) -> ResultadoDeIngesta:
    return ResultadoDeIngesta(documento.document_key, Estado.ERROR, f"{fallo.etapa}: {fallo.clase}")
