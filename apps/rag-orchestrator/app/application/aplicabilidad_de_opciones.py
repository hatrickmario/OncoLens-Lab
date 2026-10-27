"""Aplicabilidad de cada opción validada (US-125, ADR-31): traduce las fuentes evaluadas a la entrada del dominio.

Sin reglas propias: la agregación y el comparador de RN-28 viven en ``domain/``. Una fuente citada que no tiene entrada en
``applicability`` (documento sin población, o con un origen que el catálogo no declara) no figura en ``perSource``.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import replace

from app.application.aplicabilidad import AplicabilidadDeFuente
from app.application.chunk_citable import ChunkCitable
from app.domain.applicability_aggregation import (
    AplicabilidadDeOpcion,
    FuenteDeLaOpcion,
    agregar_aplicabilidad_de_opcion,
)
from app.domain.applicability_order import contar_excluyentes_no_coincide
from app.domain.option_selection import OpcionConRelevancia
from app.domain.relevance import relevancia_de_opcion


def con_aplicabilidad_de_cada_opcion(
    opciones: Sequence[OpcionConRelevancia],
    fuentes: Sequence[AplicabilidadDeFuente],
    citables: Mapping[str, ChunkCitable],
    puntajes: Mapping[str, float],
) -> tuple[OpcionConRelevancia, ...]:
    """Cada opción con la aplicabilidad de las fuentes que cita; sin ``applicability`` calculada no se agrega nada."""
    if not fuentes:
        return tuple(opciones)
    por_externo = {f.external_id: f for f in fuentes}
    return tuple(
        replace(opcion, aplicabilidad=_aplicabilidad_de(opcion, por_externo, citables, puntajes))
        for opcion in opciones
    )


def _aplicabilidad_de(
    opcion: OpcionConRelevancia,
    por_externo: Mapping[str, AplicabilidadDeFuente],
    citables: Mapping[str, ChunkCitable],
    puntajes: Mapping[str, float],
) -> AplicabilidadDeOpcion:
    citados_por_fuente: dict[str, list[str]] = {}
    for chunk_id in opcion.aceptada.chunk_ids_validos:
        externo = citables[chunk_id].ficha.external_id
        if externo in por_externo:
            citados_por_fuente.setdefault(externo, []).append(chunk_id)
    return agregar_aplicabilidad_de_opcion(
        [
            FuenteDeLaOpcion(
                external_id=externo,
                resumen=por_externo[externo].resumen,
                excluyentes_no_coincide=contar_excluyentes_no_coincide(
                    por_externo[externo].criterios
                ),
                poblacion_no_comparable=por_externo[externo].poblacion_no_comparable,
                relevance_score=relevancia_de_opcion(chunk_ids, puntajes).relevance_score,
            )
            for externo, chunk_ids in citados_por_fuente.items()
        ]
    )
