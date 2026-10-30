"""Aplicabilidad de cada opción validada (US-125, ADR-31): traduce las fuentes evaluadas a la entrada del dominio.

Sin reglas propias: la agregación y el comparador de RN-28 viven en ``domain/``. Una fuente citada que no tiene entrada en
``applicability`` (documento sin población, o con un origen que el catálogo no declara) no figura en ``perSource``.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping, Sequence
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


type Reevaluar = Callable[[AplicabilidadDeFuente, Sequence[str]], AplicabilidadDeFuente]
"""Recalcula una fuente con los fragmentos que cita una opción (ADR-47): la unidad de cálculo es el fragmento citado."""


def con_aplicabilidad_de_cada_opcion(
    opciones: Sequence[OpcionConRelevancia],
    fuentes: Sequence[AplicabilidadDeFuente],
    citables: Mapping[str, ChunkCitable],
    puntajes: Mapping[str, float],
    reevaluar: Reevaluar,
) -> tuple[OpcionConRelevancia, ...]:
    """Cada opción con la aplicabilidad de las fuentes que cita, calculada con los fragmentos que cita **esa** opción;
    sin ``applicability`` calculada no se agrega nada."""
    if not fuentes:
        return tuple(opciones)
    por_externo = {f.external_id: f for f in fuentes}
    return tuple(
        replace(
            opcion,
            aplicabilidad=_aplicabilidad_de(opcion, por_externo, citables, puntajes, reevaluar),
        )
        for opcion in opciones
    )


def fuentes_con_los_fragmentos_citados(
    fuentes: Sequence[AplicabilidadDeFuente],
    opciones: Sequence[OpcionConRelevancia],
    citables: Mapping[str, ChunkCitable],
    reevaluar: Reevaluar,
) -> tuple[AplicabilidadDeFuente, ...]:
    """La ``applicability`` de la respuesta: cada fuente recalculada con la unión de los fragmentos que citan las opciones
    mostradas; la que ninguna cita conserva su cálculo con el mejor chunk."""
    citados = _fragmentos_citados_por_fuente(opciones, citables)
    return tuple(
        reevaluar(fuente, citados[fuente.external_id]) if fuente.external_id in citados else fuente
        for fuente in fuentes
    )


def _fragmentos_citados_por_fuente(
    opciones: Sequence[OpcionConRelevancia], citables: Mapping[str, ChunkCitable]
) -> dict[str, list[str]]:
    citados: dict[str, list[str]] = {}
    for opcion in opciones:
        for chunk_id in opcion.aceptada.chunk_ids_validos:
            lista = citados.setdefault(citables[chunk_id].ficha.external_id, [])
            if chunk_id not in lista:
                lista.append(chunk_id)
    return citados


def _aplicabilidad_de(
    opcion: OpcionConRelevancia,
    por_externo: Mapping[str, AplicabilidadDeFuente],
    citables: Mapping[str, ChunkCitable],
    puntajes: Mapping[str, float],
    reevaluar: Reevaluar,
) -> AplicabilidadDeOpcion:
    citados_por_fuente = _fragmentos_citados_por_fuente([opcion], citables)
    return agregar_aplicabilidad_de_opcion(
        [
            _fuente_de_la_opcion(reevaluar(por_externo[externo], chunk_ids), chunk_ids, puntajes)
            for externo, chunk_ids in citados_por_fuente.items()
            if externo in por_externo
        ]
    )


def _fuente_de_la_opcion(
    fuente: AplicabilidadDeFuente, chunk_ids: Sequence[str], puntajes: Mapping[str, float]
) -> FuenteDeLaOpcion:
    return FuenteDeLaOpcion(
        external_id=fuente.external_id,
        resumen=fuente.resumen,
        excluyentes_no_coincide=contar_excluyentes_no_coincide(fuente.criterios),
        poblacion_no_comparable=fuente.poblacion_no_comparable,
        relevance_score=relevancia_de_opcion(chunk_ids, puntajes).relevance_score,
    )
