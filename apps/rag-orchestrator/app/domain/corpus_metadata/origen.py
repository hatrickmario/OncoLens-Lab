"""Procedencia de los metadatos de un documento (FR-19, RN-25, D2)."""

from __future__ import annotations

from enum import StrEnum

from app.domain.corpus_metadata.resultado import MetadatosResueltos
from app.domain.corpus_seed.documento import DocumentoDeSemilla


class OrigenDeMetadatos(StrEnum):
    FUENTE_ESTRUCTURADA = "fuente_estructurada"
    EXTRACCION = "extraccion"


def origen_de_metadatos(documento: DocumentoDeSemilla) -> OrigenDeMetadatos:
    """Fuente estructurada primero: si el manifiesto trae criterios de población, se copian y el LLM no se invoca."""
    raise NotImplementedError("no implementado")


def metadatos_de_la_fuente(documento: DocumentoDeSemilla) -> MetadatosResueltos:
    """Lo que el manifiesto publica de forma estructurada; lo demás, no disponible (RN-25)."""
    raise NotImplementedError("no implementado")
