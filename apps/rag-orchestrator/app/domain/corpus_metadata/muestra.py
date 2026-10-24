"""Selección reproducible de la muestra de metadatos para revisión humana (TBD-20, M-08.4)."""

from __future__ import annotations

from collections.abc import Sequence


def seleccionar_muestra(document_ids: Sequence[str], pct: float, semilla: str) -> tuple[str, ...]:
    """``ceil(N * pct / 100)`` documentos, ordenados por ``sha256(semilla + document_id)``; independiente del orden de entrada."""
    raise NotImplementedError("no implementado")
