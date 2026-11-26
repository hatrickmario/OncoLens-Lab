"""Caso de uso de ``ingest reindex-context`` (US-279, L1D-337, D4): reconstruye el índice de una variante en una colección PROPIA.

Lee la colección de origen por páginas y escribe en la de destino la fila completa de cada chunk: los VIGENTES con *dense* y *sparse*
recalculados sobre ``texto_a_embeber`` (el prefijo no se guarda: ``chunk_text`` y todo lo demás viajan tal cual, RN-04); los no
vigentes se copian sin recalcular (así el destino conserva el histórico, RN-05). Los metadatos del prefijo se leen del catálogo por su
puerto de SOLO LECTURA: el origen y el catálogo nunca se escriben. Es reanudable e idempotente: antes de procesar un documento se
descartan los ``chunk_id`` que el destino ya tiene.

Los chunks de un documento llegan juntos (la lectura va ordenada por ``chunk_id``, que empieza por el ``document_id``): la variante
``llm`` necesita los primeros chunks vigentes de cada documento como «inicio del documento», porque el original no se persiste.
Un fallo sale como etapa y clase (``FalloDeReindexacion``), nunca como mensaje (puede traer una URI o texto de un chunk).
"""

from __future__ import annotations

from collections.abc import Iterator, Sequence
from dataclasses import dataclass
from typing import Any

from app.application.corpus_ingestion.ports import (
    AlmacenDeReindexacionDeContexto,
    ChunkDeOrigen,
    ConstructorDeContexto,
    ResultadoDeContexto,
    SparsePassageEncoder,
)
from app.application.corpus_ingestion.reindexar_sparse import etapa_de_reindexacion
from app.application.ports import Clock
from app.application.seed_corpus.ports import LectorDePoblacionDelCorpus, PassageEmbedder
from app.application.seed_corpus.registros import metadatos_del_contexto_de_registro
from app.domain.corpus_seed.contexto_del_chunk import (
    VERSION_DE_LA_PLANTILLA,
    MetadatosDelContexto,
    VarianteDeContexto,
)
from app.domain.corpus_seed.reindexacion import con_vectores_sustituidos
from app.domain.corpus_seed.sparse import exigir_sparse_por_pasaje

ETAPA_LEER_ORIGEN = "leer_origen"
ETAPA_CATALOGO = "catalogo"
ETAPA_CONTEXTO = "contexto"
ETAPA_EMBEDDINGS = "embeddings"
ETAPA_SPARSE = "sparse"
ETAPA_ESCRIBIR = "escribir"


@dataclass(frozen=True)
class ResumenDeReindexacionDeContexto:
    """Solo recuentos y la duración: nunca texto de chunks, prefijos, frases del LLM, URLs ni mensajes de excepción."""

    variante: str
    version_de_la_plantilla: int
    leidos: int
    reindexados: int
    copiados: int
    ya_presentes: int
    con_respaldo_por_salida_invalida: int
    con_respaldo_por_llm_no_disponible: int
    vigentes_sin_registro: int
    duracion_s: float

    def como_diccionario(self) -> dict[str, Any]:
        return {
            "variante": self.variante,
            "version_de_la_plantilla": self.version_de_la_plantilla,
            "leidos": self.leidos,
            "reindexados": self.reindexados,
            "copiados": self.copiados,
            "ya_presentes": self.ya_presentes,
            "con_respaldo_por_salida_invalida": self.con_respaldo_por_salida_invalida,
            "con_respaldo_por_llm_no_disponible": self.con_respaldo_por_llm_no_disponible,
            "vigentes_sin_registro": self.vigentes_sin_registro,
            "duracion_s": self.duracion_s,
        }


@dataclass
class _Recuentos:
    leidos: int = 0
    reindexados: int = 0
    copiados: int = 0
    ya_presentes: int = 0
    respaldo_por_salida_invalida: int = 0
    respaldo_por_llm_no_disponible: int = 0
    vigentes_sin_registro: int = 0


class ReindexarContexto:
    def __init__(
        self,
        *,
        origen: AlmacenDeReindexacionDeContexto,
        destino: AlmacenDeReindexacionDeContexto,
        catalogo: LectorDePoblacionDelCorpus,
        embedder: PassageEmbedder,
        codificador_sparse: SparsePassageEncoder,
        constructor: ConstructorDeContexto,
        variante: VarianteDeContexto,
        lote: int,
        reloj: Clock,
    ) -> None:
        self._origen = origen
        self._destino = destino
        self._catalogo = catalogo
        self._embedder = embedder
        self._codificador_sparse = codificador_sparse
        self._constructor = constructor
        self._variante = variante
        self._lote = lote
        self._reloj = reloj

    def ejecutar(self) -> ResumenDeReindexacionDeContexto:
        inicio = self._reloj.ahora()
        metadatos = self._metadatos_del_catalogo()
        recuentos = _Recuentos()
        for chunks in self._documentos():
            self._reindexar_documento(chunks, metadatos, recuentos)
        return ResumenDeReindexacionDeContexto(
            variante=self._variante.value,
            version_de_la_plantilla=VERSION_DE_LA_PLANTILLA,
            leidos=recuentos.leidos,
            reindexados=recuentos.reindexados,
            copiados=recuentos.copiados,
            ya_presentes=recuentos.ya_presentes,
            con_respaldo_por_salida_invalida=recuentos.respaldo_por_salida_invalida,
            con_respaldo_por_llm_no_disponible=recuentos.respaldo_por_llm_no_disponible,
            vigentes_sin_registro=recuentos.vigentes_sin_registro,
            duracion_s=(self._reloj.ahora() - inicio).total_seconds(),
        )

    def _metadatos_del_catalogo(self) -> dict[str, MetadatosDelContexto]:
        """Los metadatos de cada documento vigente, leídos una vez del catálogo (RN-25: lo que no está, no se inventa)."""
        with etapa_de_reindexacion(ETAPA_CATALOGO):
            return {
                r.document_id: metadatos_del_contexto_de_registro(r)
                for r in self._catalogo.documentos_vigentes_con_poblacion()
            }

    def _documentos(self) -> Iterator[list[ChunkDeOrigen]]:
        """Los chunks de cada documento juntos y en el orden de lectura. Un documento a la vez en memoria."""
        actual: list[ChunkDeOrigen] = []
        paginas = self._paginas()
        while (pagina := self._siguiente(paginas)) is not None:
            for chunk in pagina:
                if actual and actual[0].document_id != chunk.document_id:
                    yield actual
                    actual = []
                actual.append(chunk)
        if actual:
            yield actual

    def _paginas(self) -> Iterator[list[ChunkDeOrigen]]:
        with etapa_de_reindexacion(ETAPA_LEER_ORIGEN):
            return self._origen.listar_paginado(self._lote)

    @staticmethod
    def _siguiente(paginas: Iterator[list[ChunkDeOrigen]]) -> list[ChunkDeOrigen] | None:
        with etapa_de_reindexacion(ETAPA_LEER_ORIGEN):
            return next(paginas, None)

    def _reindexar_documento(
        self,
        chunks: Sequence[ChunkDeOrigen],
        metadatos: dict[str, MetadatosDelContexto],
        recuentos: _Recuentos,
    ) -> None:
        """Escribe en el destino lo que le falta de este documento: copia los no vigentes y reindexa los vigentes."""
        presentes = self._ids_presentes(chunks)
        recuentos.leidos += len(chunks)
        recuentos.ya_presentes += len(presentes)
        vigentes = sorted((c for c in chunks if c.is_current), key=lambda c: c.chunk_index)
        copias = [c for c in chunks if not c.is_current and c.chunk_id not in presentes]
        pendientes = [i for i, c in enumerate(vigentes) if c.chunk_id not in presentes]
        filas = [dict(c.registro) for c in copias]
        filas += self._filas_reindexadas(vigentes, pendientes, metadatos, recuentos)
        if filas:
            self._escribir(filas)
        recuentos.copiados += len(copias)
        recuentos.reindexados += len(pendientes)

    def _ids_presentes(self, chunks: Sequence[ChunkDeOrigen]) -> frozenset[str]:
        with etapa_de_reindexacion(ETAPA_ESCRIBIR):
            return self._destino.ids_presentes([c.chunk_id for c in chunks])

    def _filas_reindexadas(
        self,
        vigentes: Sequence[ChunkDeOrigen],
        pendientes: Sequence[int],
        metadatos: dict[str, MetadatosDelContexto],
        recuentos: _Recuentos,
    ) -> list[dict[str, Any]]:
        """Las filas de los vigentes pendientes con los dos vectores recalculados; el resto de cada fila, tal como se leyó."""
        if not pendientes:
            return []
        del_documento = metadatos.get(vigentes[0].document_id)
        if del_documento is None:
            recuentos.vigentes_sin_registro += len(pendientes)
        contexto = self._contexto(del_documento, vigentes, pendientes)
        recuentos.respaldo_por_salida_invalida += contexto.respaldo_por_salida_invalida
        recuentos.respaldo_por_llm_no_disponible += contexto.respaldo_por_llm_no_disponible
        dense = self._embeber(contexto.textos)
        sparse = self._codificar_sparse(contexto.textos)
        return [
            con_vectores_sustituidos(vigentes[i].registro, vector, terminos)
            for i, vector, terminos in zip(pendientes, dense, sparse, strict=True)
        ]

    def _contexto(
        self,
        metadatos: MetadatosDelContexto | None,
        vigentes: Sequence[ChunkDeOrigen],
        pendientes: Sequence[int],
    ) -> ResultadoDeContexto:
        with etapa_de_reindexacion(ETAPA_CONTEXTO):
            return self._constructor.textos_a_embeber(
                metadatos,
                [c.chunk_text for c in vigentes],
                secciones=[c.section for c in vigentes],
                pendientes=pendientes,
            )

    def _embeber(self, textos: Sequence[str]) -> list[list[float]]:
        with etapa_de_reindexacion(ETAPA_EMBEDDINGS):
            return self._embedder.embeber(textos)

    def _codificar_sparse(self, textos: Sequence[str]) -> list[dict[int, float]]:
        """Un vector no vacío por texto: si el adapter rompe ese contrato no se escribe nada (Milvus lo rechazaría)."""
        with etapa_de_reindexacion(ETAPA_SPARSE):
            return list(
                exigir_sparse_por_pasaje(self._codificador_sparse.codificar(textos), len(textos))
            )

    def _escribir(self, filas: Sequence[dict[str, Any]]) -> None:
        with etapa_de_reindexacion(ETAPA_ESCRIBIR):
            self._destino.escribir_filas(filas)
