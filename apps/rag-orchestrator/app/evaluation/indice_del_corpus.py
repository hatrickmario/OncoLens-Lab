"""Fuente ``indice`` del corpus de la suite `evaluate` (L1D-326, ``[S7 resp. 10]``): lee en SOLO LECTURA la ingesta.

El chat se mide sobre la colección de Milvus y el catálogo ``corpus`` que dejó la ingesta de ``l1d-119``, no sobre el
corpus del dataset en memoria. Se compone con los MISMOS adapters de lectura de producción (``crear_puertos_del_corpus``:
rol ``rag_corpus`` y Milvus, nunca un schema clínico) y solo se consulta: ni inserta, ni reescribe, ni marca vigencias (RN-05).
Si la colección no existe o no tiene chunks vigentes la suite aborta: nunca mide sobre otro corpus. El resumen que el reporte
publica lleva la colección, el recuento y una huella de los ids de chunk; nunca texto. Otras familias (``l1d-336``, ``l1d-337``)
reutilizan ``IndiceDelCorpus``: la composición de la suite recibe sus ``puertos`` sin saber de dónde salen.
"""

from __future__ import annotations

import hashlib
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from typing import Any

from app.application.ports import PuertosDelCorpus
from app.config.settings import POBLACION_MAX_VALORES_POR_CRITERIO_INICIAL
from app.evaluation.adaptadores_falsos import (
    BuscadorEnMemoria,
    CatalogoEnMemoria,
    LectorReleaseFijo,
    PosicionesDelDataset,
)
from app.evaluation.fuente_dataset import DatasetSuite
from app.evaluation.guardas import SuiteAbortada
from app.infrastructure.corpus.composicion import (
    CorpusNoDisponibleError,
    crear_puertos_del_corpus,
    leer_configuracion_del_corpus,
)

LOTE_DE_LECTURA = 500
"""Chunks por página al contar los vigentes (debe quedar bajo el tope de consulta de Milvus)."""
COLECCION_FINGIDA = "indice_fingido"


@dataclass(frozen=True)
class ResumenDelIndice:
    """Lo que el reporte declara del corpus leído: colección, chunks vigentes y huella de sus ids; nunca texto."""

    coleccion: str
    chunks_vigentes: int
    huella: str


@dataclass(frozen=True)
class IndiceDelCorpus:
    puertos: PuertosDelCorpus
    resumen: ResumenDelIndice


def huella_de_chunks(chunk_ids: Iterable[str]) -> str:
    """SHA-256 de los ids de chunk ordenados: identifica el contenido del índice sin depender del orden de lectura."""
    return hashlib.sha256("\n".join(sorted(chunk_ids)).encode("utf-8")).hexdigest()


def exigir_indice_utilizable(resumen: ResumenDelIndice) -> None:
    """Falla cerrado: un índice sin chunks vigentes no se mide (la medición no corre sobre un corpus vacío)."""
    if resumen.chunks_vigentes <= 0:
        raise SuiteAbortada(
            "el índice del corpus está vacío: la ingesta de l1d-119 no dejó chunks vigentes"
        )


def indice_fingido(dataset: DatasetSuite, vectores: Any) -> IndiceDelCorpus:
    """El almacén vectorial y el catálogo fingidos en su puerto, sobre el corpus del dataset (solo lectura, como el real)."""
    puertos = PuertosDelCorpus(
        buscador=BuscadorEnMemoria(dataset, vectores),
        lector_release=LectorReleaseFijo(dataset),
        catalogo=CatalogoEnMemoria(dataset),
        posiciones=PosicionesDelDataset(dataset),
    )
    resumen = ResumenDelIndice(
        COLECCION_FINGIDA, len(dataset.chunks), huella_de_chunks(c.id for c in dataset.chunks)
    )
    return IndiceDelCorpus(puertos, resumen)


def abrir_indice_real(
    *,
    fabricar_cliente: Callable[..., Any] | None = None,
    fabricar_motor: Callable[..., Any] | None = None,
) -> IndiceDelCorpus:
    """Abre la ingesta en solo lectura con la configuración del entorno (``MILVUS_*``, ``CORPUS_DATABASE_URL``). Las fábricas se
    inyectan en los tests. Un fallo nombra la variable y nunca la URI, el host ni el motivo del cliente (RN-12, RN-22)."""
    try:
        milvus, base = leer_configuracion_del_corpus()
        puertos = crear_puertos_del_corpus(
            milvus,
            base,
            fabricar_cliente=fabricar_cliente,
            fabricar_motor=fabricar_motor,
            max_valores_de_poblacion=POBLACION_MAX_VALORES_POR_CRITERIO_INICIAL,
        )
    except CorpusNoDisponibleError as error:
        raise SuiteAbortada(f"el índice del corpus no está disponible: {error.variable}") from None
    return IndiceDelCorpus(puertos, _resumen_de(puertos, milvus.milvus_collection_name))


def _resumen_de(puertos: PuertosDelCorpus, coleccion: str) -> ResumenDelIndice:
    listar = getattr(puertos.buscador, "listar_vigentes_paginado", None)
    if listar is None:
        raise SuiteAbortada("el índice del corpus no permite contar sus chunks vigentes")
    try:
        ids = [chunk.chunk_id for pagina in listar(LOTE_DE_LECTURA) for chunk in pagina]
    except Exception:  # noqa: BLE001 - el mensaje del cliente lleva la URI
        raise SuiteAbortada("el índice del corpus no se pudo leer: MILVUS_URI") from None
    return ResumenDelIndice(coleccion, len(ids), huella_de_chunks(ids))
