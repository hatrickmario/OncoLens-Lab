"""Fuente ``indice`` del corpus de la suite `evaluate` (L1D-326, ``[S7 resp. 10]``): lee en SOLO LECTURA la ingesta.

El chat se mide sobre la colección de Milvus y el catálogo ``corpus`` que dejó la ingesta de ``l1d-119``, no sobre el
corpus del dataset en memoria. Se compone con los MISMOS adapters de lectura de producción (``crear_puertos_del_corpus``:
rol ``rag_corpus`` y Milvus, nunca un schema clínico) y solo se consulta: ni inserta, ni reescribe, ni marca vigencias (RN-05).
Un ``IndiceDelCorpus`` sin chunks vigentes no existe (falla cerrado al construirse): la suite nunca mide sobre un corpus vacío ni
sobre otro corpus. El resumen que el reporte publica lleva la colección, el recuento y una huella de los ids de chunk; nunca
texto. Otras familias (``l1d-336``, ``l1d-337``) reutilizan ``IndiceDelCorpus``: la composición de la suite recibe sus ``puertos``
sin saber de dónde salen, y el almacén fingido (``adaptadores_falsos.indice_fingido``) pasa por la misma construcción.
"""

from __future__ import annotations

import hashlib
from collections.abc import Callable, Iterable, Iterator
from dataclasses import dataclass
from typing import Any, Protocol, runtime_checkable

from app.application.corpus_ingestion.ports import ChunkParaReindexar
from app.application.ports import PuertosDelCorpus
from app.evaluation.guardas import SuiteAbortada
from app.infrastructure.corpus.composicion import (
    CorpusNoDisponibleError,
    crear_puertos_del_corpus,
    leer_configuracion_del_corpus,
)

LOTE_DE_LECTURA = 500
"""Chunks por página al contar los vigentes (debe quedar bajo el tope de consulta de Milvus)."""
COLECCION_FINGIDA = "indice_fingido"


@runtime_checkable
class LectorDeVigentes(Protocol):
    """Lo que la fuente ``indice`` pide al almacén: listar los chunks vigentes por páginas. Es la mitad de lectura de
    ``AlmacenDeReindexacionSparse``: aquella incluye ``reescribir_sparse``, una escritura que esta fuente nunca debe poder
    llamar."""

    def listar_vigentes_paginado(self, lote: int) -> Iterator[list[ChunkParaReindexar]]: ...


@dataclass(frozen=True)
class ResumenDelIndice:
    """Lo que el reporte declara del corpus leído: colección, chunks vigentes y huella de sus ids; nunca texto."""

    coleccion: str
    chunks_vigentes: int
    huella: str


def huella_de_chunks(chunk_ids: Iterable[str]) -> str:
    """SHA-256 de los ids de chunk ordenados: identifica el contenido del índice sin depender del orden de lectura."""
    return hashlib.sha256("\n".join(sorted(chunk_ids)).encode("utf-8")).hexdigest()


def exigir_indice_utilizable(resumen: ResumenDelIndice) -> None:
    """Falla cerrado: un índice sin chunks vigentes no se mide (la medición no corre sobre un corpus vacío)."""
    if resumen.chunks_vigentes <= 0:
        raise SuiteAbortada(
            "el índice del corpus está vacío: la ingesta de l1d-119 no dejó chunks vigentes"
        )


def resumir_almacen(almacen: LectorDeVigentes, coleccion: str) -> ResumenDelIndice:
    """El recuento y la huella de los chunks vigentes del almacén (un solo camino para el índice real y el fingido)."""
    try:
        ids = [
            chunk.chunk_id
            for pagina in almacen.listar_vigentes_paginado(LOTE_DE_LECTURA)
            for chunk in pagina
        ]
    except Exception:  # noqa: BLE001 - el mensaje del cliente lleva la URI
        raise SuiteAbortada("el índice del corpus no se pudo leer: MILVUS_URI") from None
    return ResumenDelIndice(coleccion, len(ids), huella_de_chunks(ids))


@dataclass(frozen=True)
class IndiceDelCorpus:
    puertos: PuertosDelCorpus
    resumen: ResumenDelIndice

    def __post_init__(self) -> None:
        exigir_indice_utilizable(self.resumen)

    @classmethod
    def abrir(
        cls, puertos: PuertosDelCorpus, almacen: LectorDeVigentes, coleccion: str
    ) -> IndiceDelCorpus:
        return cls(puertos, resumir_almacen(almacen, coleccion))

    def describir(self) -> dict[str, Any]:
        """El corpus con el que corrió la suite para el reporte, sin texto."""
        return {
            "fuente": "indice",
            "coleccion": self.resumen.coleccion,
            "chunks_vigentes": self.resumen.chunks_vigentes,
            "huella": self.resumen.huella,
        }


def exigir_indice_pedido(fuente: str, indice: IndiceDelCorpus | None) -> None:
    """``indice.fuente: milvus`` sin índice abierto aborta: la suite no cae en silencio al corpus del dataset."""
    if fuente == "milvus" and indice is None:
        raise SuiteAbortada(
            "la configuración pide indice.fuente: milvus y no se abrió ningún índice del corpus"
        )


def abrir_indice_real(
    *,
    max_valores_de_poblacion: int,
    fabricar_cliente: Callable[..., Any] | None = None,
    fabricar_motor: Callable[..., Any] | None = None,
    coleccion: str | None = None,
) -> IndiceDelCorpus:
    """Abre la ingesta en solo lectura con la configuración del entorno (``MILVUS_*``, ``CORPUS_DATABASE_URL``).

    ``max_valores_de_poblacion`` es el de ``Settings`` (como en producción). Las fábricas se inyectan en los tests. Un fallo
    nombra la variable y nunca la URI, el host ni el motivo del cliente (RN-12, RN-22); un índice sin chunks vigentes aborta.
    ``coleccion`` sustituye a ``MILVUS_COLLECTION_NAME`` (el brazo de chunks de 512 tokens lee su colección propia, US-278): el
    catálogo ``corpus`` es el mismo y solo se lee."""
    try:
        milvus, base = leer_configuracion_del_corpus()
        if coleccion is not None:
            milvus = milvus.model_copy(update={"milvus_collection_name": coleccion})
        puertos = crear_puertos_del_corpus(
            milvus,
            base,
            fabricar_cliente=fabricar_cliente,
            fabricar_motor=fabricar_motor,
            max_valores_de_poblacion=max_valores_de_poblacion,
        )
    except CorpusNoDisponibleError as error:
        raise SuiteAbortada(f"el índice del corpus no está disponible: {error.variable}") from None
    if not isinstance(puertos.buscador, LectorDeVigentes):
        raise SuiteAbortada("el índice del corpus no permite contar sus chunks vigentes")
    return IndiceDelCorpus.abrir(puertos, puertos.buscador, milvus.milvus_collection_name)
