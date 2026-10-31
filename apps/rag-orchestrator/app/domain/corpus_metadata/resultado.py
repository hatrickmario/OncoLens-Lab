"""Resultado del paso de metadatos de la ingesta (US-118): valores que se conservan y su procedencia (RN-25)."""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from typing import Any, Final, Protocol, TypeVar

FUENTE_ESTRUCTURADA: Final = "fuente_estructurada"
EXTRAIDO_VERIFICADO: Final = "extraido_verificado"
PENDIENTE: Final = "pendiente"
ETAPA_DE_METADATOS: Final = "metadatos"


class _ConProcedencia(Protocol):
    document_id: str
    metadata_source: str


_Fila = TypeVar("_Fila", bound=_ConProcedencia)


def solo_extraidos_verificados(filas: Iterable[_Fila]) -> list[_Fila]:
    raise NotImplementedError("no implementado")


@dataclass(frozen=True)
class CampoDeMetadato:
    """Un metadato propuesto por el LLM o ya verificado por el NLI: nombre del campo (el de ``studyKey``) y su valor."""

    campo: str
    valor: str | int


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
    campos_verificados: tuple[CampoDeMetadato, ...] = ()
    fallo: FalloDeMetadatos | None = None
