"""Caso de uso de ``ingest reindex-sparse`` (US-117b D2/D3): puebla el *sparse* de los chunks vigentes sin tocar su *dense*.

Lee los vigentes por páginas, codifica cada página con el adapter de *embeddings* y reescribe solo ``sparse_vector``. No
escribe en el catálogo (D3). Un fallo se informa con la etapa (``leer_vigentes`` | ``codificar`` | ``reescribir``) y la clase del
error, nunca su mensaje (puede traer la URI de Milvus o texto de un chunk). Es idempotente: se puede repetir.
"""

from __future__ import annotations

from collections.abc import Iterator, Sequence
from contextlib import contextmanager
from dataclasses import dataclass
from typing import Final

from app.application.corpus_ingestion.ports import (
    AlmacenDeReindexacionSparse,
    ChunkParaReindexar,
    SparsePassageEncoder,
)
from app.domain.corpus_seed.errores import VectorSparseVacio

ETAPA_LEER: Final = "leer_vigentes"
ETAPA_CODIFICAR: Final = "codificar"
ETAPA_REESCRIBIR: Final = "reescribir"


class FalloDeReindexacion(Exception):
    """Una etapa falló: lleva su nombre y la clase del error, nunca su mensaje."""

    def __init__(self, etapa: str, causa: Exception) -> None:
        super().__init__(etapa)
        self.etapa = etapa
        self.clase = type(causa).__name__


@dataclass(frozen=True)
class ResumenDeReindexacion:
    """Solo recuentos: nunca texto de chunks (D3)."""

    leidos: int
    reindexados: int


@contextmanager
def _etapa(nombre: str) -> Iterator[None]:
    try:
        yield
    except Exception as error:  # noqa: BLE001 - borde de un puerto: se informa la etapa y la clase
        raise FalloDeReindexacion(nombre, error) from None


class ReindexarSparse:
    def __init__(
        self, *, almacen: AlmacenDeReindexacionSparse, codificador: SparsePassageEncoder, lote: int
    ) -> None:
        self._almacen = almacen
        self._codificador = codificador
        self._lote = lote

    def ejecutar(self) -> ResumenDeReindexacion:
        leidos = reindexados = 0
        paginas = self._paginas()
        while (pagina := self._siguiente(paginas)) is not None:
            leidos += len(pagina)
            reindexados += self._reindexar_pagina(pagina)
        return ResumenDeReindexacion(leidos, reindexados)

    def _paginas(self) -> Iterator[list[ChunkParaReindexar]]:
        with _etapa(ETAPA_LEER):
            return self._almacen.listar_vigentes_paginado(self._lote)

    @staticmethod
    def _siguiente(paginas: Iterator[list[ChunkParaReindexar]]) -> list[ChunkParaReindexar] | None:
        with _etapa(ETAPA_LEER):
            return next(paginas, None)

    def _reindexar_pagina(self, pagina: Sequence[ChunkParaReindexar]) -> int:
        vectores = self._codificar(pagina)
        with _etapa(ETAPA_REESCRIBIR):
            return self._almacen.reescribir_sparse(pagina, vectores)

    def _codificar(self, pagina: Sequence[ChunkParaReindexar]) -> list[dict[int, float]]:
        """Un vector no vacío por chunk: si el adapter rompe ese contrato no se escribe nada (Milvus lo rechazaría)."""
        with _etapa(ETAPA_CODIFICAR):
            vectores = self._codificador.codificar([chunk.chunk_text for chunk in pagina])
            if len(vectores) != len(pagina) or not all(vectores):
                raise VectorSparseVacio()
        return vectores
