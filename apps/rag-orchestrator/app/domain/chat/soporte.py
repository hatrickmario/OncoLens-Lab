"""Soporte admitido de una afirmación del chat (RN-24, RN-04, RN-01): regla pura, sin E/S."""

from __future__ import annotations

from collections.abc import Collection


def afirmacion_tiene_soporte_del_turno(
    fact_refs: Collection[str],
    chunk_ids: Collection[str],
    fact_refs_del_turno: Collection[str],
    chunk_ids_del_turno: Collection[str],
) -> bool:
    raise NotImplementedError("no implementado")
