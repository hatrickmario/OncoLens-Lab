"""Lector de fichas de fuente del catálogo (schema `corpus`, rol `rag_corpus`): implementa `CorpusCatalogReader`."""

from __future__ import annotations

from collections.abc import Collection, Mapping
from typing import Any

import sqlalchemy as sa
from sqlalchemy import Engine

from app.domain.aplicabilidad_tipos import PoblacionDelEstudio
from app.domain.citations import FichaDeFuente
from app.infrastructure.catalog.tables import corpus_document


class LectorCatalogoPostgres:
    """Solo lectura sobre ``corpus.corpus_document``; el motor ya fija ``search_path=corpus`` (`crear_motor`)."""

    def __init__(self, motor: Engine) -> None:
        self._motor = motor

    def fichas_por_documento(self, document_ids: Collection[str]) -> dict[str, FichaDeFuente]:
        """Una ficha por documento existente; los ids que no están en el catálogo no aparecen en el resultado."""
        if not document_ids:
            return {}
        consulta = sa.select(corpus_document).where(
            corpus_document.c.document_id.in_(sorted(document_ids))
        )
        with self._motor.connect() as conexion:
            filas = conexion.execute(consulta).mappings().all()
        return {fila["document_id"]: ficha_de_fila(fila) for fila in filas}

    def poblacion_por_documento(
        self, document_ids: Collection[str]
    ) -> dict[str, PoblacionDelEstudio]:
        """``population_criteria`` y ``metadata_source`` tal como están guardados (``pendiente`` incluido).

        Solo las dos columnas de población: la ficha completa no hace falta para evaluar criterios. Un documento
        inexistente no figura en el resultado."""
        if not document_ids:
            return {}
        consulta = sa.select(
            corpus_document.c.document_id,
            corpus_document.c.population_criteria,
            corpus_document.c.metadata_source,
        ).where(corpus_document.c.document_id.in_(sorted(document_ids)))
        with self._motor.connect() as conexion:
            filas = conexion.execute(consulta).mappings().all()
        return {fila["document_id"]: _poblacion_de_fila(fila) for fila in filas}


def _poblacion_de_fila(fila: Mapping[str, Any]) -> PoblacionDelEstudio:
    """``population_criteria`` debe ser un objeto JSON; otra forma es un catálogo corrupto y se rechaza (el
    orquestador lo traduce en 503) en vez de leerse como «sin población». El mensaje no lleva el contenido."""
    criterios = fila["population_criteria"]
    if not isinstance(criterios, dict):
        raise ValueError("population_criteria no es un objeto JSON")
    return PoblacionDelEstudio(fila["metadata_source"], criterios)


def ficha_de_fila(fila: Mapping[str, Any]) -> FichaDeFuente:
    """Metadatos de la cita tal como están en el catálogo; el texto vacío de una columna opcional es ausencia."""
    return FichaDeFuente(
        title=fila["title"],
        source_name=fila["source_name"],
        external_id=fila["external_id"],
        language=fila["language"],
        source_type=fila["source_type"],
        license_class=fila["license_class"],
        study_design=_o_none(fila["study_design"]),
        trial_phase=_o_none(fila["trial_phase"]),
        primary_endpoint=_o_none(fila["primary_endpoint"]),
        sample_size=fila["sample_size"],
        published_at=fila["published_at"],
        last_updated_at=fila["last_updated_at"],
        guideline_version=_o_none(fila["guideline_version"]),
        authors=None,  # el catálogo (data-model §4.6) aún no registra autoría: la UI muestra "No disponible" (RN-25)
        source_url=_o_none(fila["source_url"]),
    )


def _o_none(valor: str | None) -> str | None:
    return valor or None
