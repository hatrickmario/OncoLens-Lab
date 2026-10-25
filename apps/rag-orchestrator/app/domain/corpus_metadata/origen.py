"""Procedencia de los metadatos de un documento (FR-19, RN-25, D2)."""

from __future__ import annotations

from dataclasses import replace
from enum import StrEnum

from app.domain.corpus_metadata.resultado import (
    FUENTE_ESTRUCTURADA,
    PENDIENTE,
    MetadatosResueltos,
)
from app.domain.corpus_seed.documento import DocumentoDeSemilla
from app.domain.corpus_seed.poblacion import resolver_criterios_poblacion


class OrigenDeMetadatos(StrEnum):
    FUENTE_ESTRUCTURADA = "fuente_estructurada"
    EXTRACCION = "extraccion"


def origen_de_metadatos(documento: DocumentoDeSemilla) -> OrigenDeMetadatos:
    """Fuente estructurada primero: si el manifiesto trae criterios de población, se copian y el LLM no se invoca."""
    if documento.population_criteria:
        return OrigenDeMetadatos.FUENTE_ESTRUCTURADA
    return OrigenDeMetadatos.EXTRACCION


def metadatos_de_la_fuente(documento: DocumentoDeSemilla) -> MetadatosResueltos:
    """Lo que el manifiesto publica de forma estructurada; lo demás, no disponible (RN-25)."""
    return MetadatosResueltos(
        study_design=documento.study_design,
        trial_phase=documento.trial_phase,
        sample_size=documento.sample_size,
        primary_endpoint=documento.primary_endpoint,
        population_criteria=resolver_criterios_poblacion(documento.population_criteria),
        metadata_source=FUENTE_ESTRUCTURADA,
    )


def metadatos_sin_extraer(documento: DocumentoDeSemilla) -> MetadatosResueltos:
    """Metadatos de una fila que aún no pasó por la extracción (``normalizado``, ``error``, rechazado): lo estructurado
    se copia; si la fuente no publicó criterios queda ``pendiente``, nunca ``fuente_estructurada`` (D4, RN-25)."""
    if origen_de_metadatos(documento) is OrigenDeMetadatos.FUENTE_ESTRUCTURADA:
        return metadatos_de_la_fuente(documento)
    return replace(metadatos_de_la_fuente(documento), metadata_source=PENDIENTE)
