"""``PosicionesFalsas``: el ``PosicionDeChunks`` en memoria sobre un corpus de prueba (L1D-322).

Cumple el contrato del puerto como el adapter de Milvus: solo devuelve los chunks que existen y están vigentes; el
``ordinal`` cuenta desde 1 en el orden del corpus dentro de su documento y ``cantidad`` son los chunks vigentes de ese
documento. Un fallo configurado se propaga tal cual (sin detalle), y cada invocación se cuenta.
"""

from __future__ import annotations

from collections.abc import Collection, Sequence

from app.application.ports import PosicionDeChunk
from tests.support.recuperacion import ChunkFx


class PosicionesFalsas:
    def __init__(self, corpus: Sequence[ChunkFx], error: Exception | None = None) -> None:
        self._vigentes = [c for c in corpus if c.es_vigente]
        self.error = error
        self.consultas: list[frozenset[str]] = []

    @property
    def invocaciones(self) -> int:
        return len(self.consultas)

    def posiciones(self, chunk_ids: Collection[str]) -> dict[str, PosicionDeChunk]:
        self.consultas.append(frozenset(chunk_ids))
        if self.error is not None:
            raise self.error
        por_documento: dict[str, list[str]] = {}
        for chunk in self._vigentes:
            por_documento.setdefault(chunk.document_id, []).append(chunk.chunk_id)
        posiciones: dict[str, PosicionDeChunk] = {}
        for chunk in self._vigentes:
            if chunk.chunk_id not in chunk_ids:
                continue
            hermanos = por_documento[chunk.document_id]
            posiciones[chunk.chunk_id] = PosicionDeChunk(
                chunk.document_id, hermanos.index(chunk.chunk_id) + 1, len(hermanos)
            )
        return posiciones
