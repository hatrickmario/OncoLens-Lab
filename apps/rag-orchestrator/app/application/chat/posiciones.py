"""Posición de chunks en su documento (``ChatCitation.chunkOrdinal`` y ``chunkCount``): la regla única de los fakes."""

from __future__ import annotations

from collections.abc import Mapping, Sequence

from app.application.ports import PosicionDeChunk


def posiciones_por_documento(
    por_documento: Mapping[str, Sequence[str]],
) -> dict[str, PosicionDeChunk]:
    """El ordinal cuenta desde 1 en el orden de cada documento y ``cantidad`` son sus chunks; un fake de ``PosicionDeChunks``
    solo devuelve lo que este mapa conoce, como el adapter de Milvus."""
    return {
        chunk: PosicionDeChunk(documento, ordinal, len(chunks))
        for documento, chunks in por_documento.items()
        for ordinal, chunk in enumerate(chunks, start=1)
    }
