"""Caso de uso de ``ingest reindex-context`` (US-279, L1D-337, D4): reconstruye el índice de una variante en una colección PROPIA.

Esqueleto: la implementación llega con el commit ``feat(L1D-337)`` de AC-6.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.application.corpus_ingestion.ports import (
    AlmacenDeReindexacionDeContexto,
    ConstructorDeContexto,
    SparsePassageEncoder,
)
from app.application.ports import Clock
from app.application.seed_corpus.ports import LectorDePoblacionDelCorpus, PassageEmbedder
from app.domain.corpus_seed.contexto_del_chunk import VarianteDeContexto


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
        raise NotImplementedError("no implementado")


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

    def ejecutar(self) -> ResumenDeReindexacionDeContexto:
        raise NotImplementedError("no implementado")
