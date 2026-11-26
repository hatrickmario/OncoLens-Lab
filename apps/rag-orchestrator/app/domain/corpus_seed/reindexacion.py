"""Regla pura de la reindexación *sparse* (US-117b D2, AC-2): la fila reescrita solo cambia ``sparse_vector``."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any, Final

CAMPO_SPARSE_VECTOR: Final = "sparse_vector"
CAMPO_DENSE_VECTOR: Final = "dense_vector"


def con_vectores_sustituidos(
    fila: Mapping[str, Any], dense: Sequence[float], sparse: Mapping[int, float]
) -> dict[str, Any]:
    """Copia de ``fila`` con ``dense_vector`` y ``sparse_vector`` sustituidos y todo lo demás tal cual (``chunk_id``, ``chunk_text``,
    ``is_current``…): la reindexación de contexto (US-279) nunca cambia el texto citable ni los metadatos (RN-04). Un *sparse* vacío no
    se escribe nunca (``ValueError``)."""
    if not sparse:
        raise ValueError("el vector sparse no puede estar vacío")
    return {**fila, CAMPO_DENSE_VECTOR: list(dense), CAMPO_SPARSE_VECTOR: dict(sparse)}


def con_sparse_sustituido(fila: Mapping[str, Any], sparse: Mapping[int, float]) -> dict[str, Any]:
    """Copia de ``fila`` con ``sparse_vector`` = ``sparse`` y todo lo demás tal cual (``chunk_id``, ``dense_vector``,
    ``is_current``…). Defensa de la fila (``ValueError``): un *sparse* vacío no se escribe nunca. La regla por pasaje, con ``VectorSparseVacio``,
    es ``exigir_sparse_por_pasaje``."""
    if not sparse:
        raise ValueError("el vector sparse no puede estar vacío")
    return {**fila, CAMPO_SPARSE_VECTOR: dict(sparse)}
