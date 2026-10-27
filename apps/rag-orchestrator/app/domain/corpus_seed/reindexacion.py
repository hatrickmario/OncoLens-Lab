"""Regla pura de la reindexación *sparse* (US-117b D2, AC-2): la fila reescrita solo cambia ``sparse_vector``."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any, Final

CAMPO_SPARSE_VECTOR: Final = "sparse_vector"


def con_sparse_sustituido(fila: Mapping[str, Any], sparse: Mapping[int, float]) -> dict[str, Any]:
    """Copia de ``fila`` con ``sparse_vector`` = ``sparse`` y todo lo demás tal cual (``chunk_id``, ``dense_vector``,
    ``is_current``…). Un *sparse* vacío se rechaza: Milvus lo descartaría y el chunk quedaría sin términos."""
    if not sparse:
        raise ValueError("el vector sparse no puede estar vacío")
    return {**fila, CAMPO_SPARSE_VECTOR: dict(sparse)}
