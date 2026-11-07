"""Bloques ``evidencia`` de las afirmaciones con soporte de un turno de chat (RN-04): una sola regla para los nodos que
generan afirmaciones citadas (seguimiento de un análisis, US-265, y relevancia de un dato, US-264)."""

from __future__ import annotations

from collections.abc import Mapping

from app.application.chat.citas import ConstructorDeCitas, FuenteDeCita
from app.application.chunk_citable import ChunkCitable
from app.domain.chat.turno import BloqueDelTurno, TipoDeBloque
from app.domain.citations import OpcionAceptada


async def bloques_de_afirmaciones_con_soporte(
    constructor: ConstructorDeCitas,
    trace_id: str,
    soportadas: tuple[OpcionAceptada, ...],
    citables: Mapping[str, ChunkCitable],
) -> tuple[BloqueDelTurno, ...]:
    """Un bloque ``evidencia`` por afirmación con soporte; cada cita se copia del corpus y de su ficha del catálogo, nunca
    del texto generado (RN-04)."""
    fuentes = [
        FuenteDeCita(i, citables[i].ficha.title, citables[i].chunk.chunk_text)
        for aceptada in soportadas
        for i in aceptada.chunk_ids_validos
    ]
    citas = await constructor.construir(trace_id, fuentes)
    return tuple(
        BloqueDelTurno(
            TipoDeBloque.evidencia,
            aceptada.opcion.rationale,
            citas=tuple(citas[i] for i in aceptada.chunk_ids_validos),
        )
        for aceptada in soportadas
    )
