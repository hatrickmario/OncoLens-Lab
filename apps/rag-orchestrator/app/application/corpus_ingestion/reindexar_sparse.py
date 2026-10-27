"""Caso de uso de ``ingest reindex-sparse`` (US-117b D2/D3): puebla el *sparse* de los chunks vigentes sin tocar su *dense*."""

from __future__ import annotations

from dataclasses import dataclass

from app.application.corpus_ingestion.ports import AlmacenDeReindexacionSparse, SparsePassageEncoder


@dataclass(frozen=True)
class ResumenDeReindexacion:
    """Solo recuentos: nunca texto de chunks (D3)."""

    leidos: int
    reindexados: int


class ReindexarSparse:
    def __init__(
        self, *, almacen: AlmacenDeReindexacionSparse, codificador: SparsePassageEncoder, lote: int
    ) -> None:
        self._almacen = almacen
        self._codificador = codificador
        self._lote = lote

    def ejecutar(self) -> ResumenDeReindexacion:
        raise NotImplementedError("no implementado")
