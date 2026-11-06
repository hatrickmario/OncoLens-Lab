"""Soporte admitido de una afirmación del chat (RN-24, RN-04, RN-01): regla pura, sin E/S.

Solo cuenta lo recuperado o enviado en ESTE turno: los hechos del caso del turno y los chunks recuperados en el turno. La
memoria (turnos previos, estado estructurado) nunca sostiene una afirmación: una afirmación sin referencia o con una
referencia que no es de este turno se omite.
"""

from __future__ import annotations

from collections.abc import Collection


def afirmacion_tiene_soporte_del_turno(
    fact_refs: Collection[str],
    chunk_ids: Collection[str],
    fact_refs_del_turno: Collection[str],
    chunk_ids_del_turno: Collection[str],
) -> bool:
    """``True`` si la afirmación cita al menos algo y TODO lo que cita es de este turno."""
    if not fact_refs and not chunk_ids:
        return False
    return all(r in fact_refs_del_turno for r in fact_refs) and all(
        c in chunk_ids_del_turno for c in chunk_ids
    )
