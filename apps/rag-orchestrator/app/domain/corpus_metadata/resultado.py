"""Resultado del paso de metadatos de la ingesta (US-118): valores que se conservan y su procedencia (RN-25)."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any, Final

FUENTE_ESTRUCTURADA: Final = "fuente_estructurada"
EXTRAIDO_VERIFICADO: Final = "extraido_verificado"
PENDIENTE: Final = "pendiente"
ETAPA_DE_METADATOS: Final = "metadatos"


@dataclass(frozen=True)
class CampoVerificado:
    """Un metadato que el NLI confirmó contra el texto de la fuente: nombre del campo y valor legible."""

    campo: str
    valor: str


@dataclass(frozen=True)
class FalloDeMetadatos:
    """Por qué el documento quedó ``pendiente``: etapa y clase del error, nunca su mensaje (RN-10)."""

    clase: str
    etapa: str = ETAPA_DE_METADATOS

    @property
    def motivo(self) -> str:
        return f"{self.etapa}: {self.clase}"


@dataclass(frozen=True)
class MetadatosResueltos:
    """Lo que se escribe en el catálogo (y se denormaliza a Milvus) para un documento."""

    study_design: str
    trial_phase: str | None
    sample_size: int | None
    primary_endpoint: str | None
    population_criteria: Mapping[str, Any]
    metadata_source: str
    campos_verificados: tuple[CampoVerificado, ...] = ()
    fallo: FalloDeMetadatos | None = None
