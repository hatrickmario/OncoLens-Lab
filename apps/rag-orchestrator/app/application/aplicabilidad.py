"""``ApplicabilityService``: aplicabilidad por fuente recuperada con los criterios del catálogo (FR-25, US-122).

Sin puerto de LLM: es la garantía estructural de ADR-34 (b). La lectura de ``population_criteria`` (E/S) la hace el
orquestador con su borde fallando cerrado; este servicio solo compone las reglas puras de ``domain/``.
"""

from collections.abc import Mapping
from dataclasses import dataclass

from app.application.chunk_citable import ChunkCitable
from app.domain.aplicabilidad_tipos import (
    ContextoDelPaciente,
    CriterioEvaluado,
    PoblacionDelEstudio,
    ResumenDeEstados,
)
from app.domain.criterios_aplicabilidad import CriterioDeAplicabilidad, CriteriosDeAplicabilidad


@dataclass(frozen=True)
class AplicabilidadDeFuente:
    """Los criterios evaluados de un documento y su mejor chunk, del que salen las citas de los estructurados."""

    external_id: str
    mejor_chunk: ChunkCitable
    criterios: tuple[CriterioEvaluado, ...]
    resumen: ResumenDeEstados
    poblacion_no_comparable: bool


def mejor_chunk_por_documento(citables: Mapping[str, ChunkCitable]) -> dict[str, ChunkCitable]:
    return {}  # esqueleto (L1D-127): el comportamiento llega con el commit feat


class ApplicabilityService:
    def __init__(self, criterios: CriteriosDeAplicabilidad) -> None:
        self._criterios = criterios

    def criterios_del(self, tipo_de_cancer: str) -> tuple[CriterioDeAplicabilidad, ...]:
        return self._criterios.criterios(tipo_de_cancer)

    def evaluar(
        self,
        tipo_de_cancer: str,
        contexto: ContextoDelPaciente,
        mejores_chunks: Mapping[str, ChunkCitable],
        poblaciones: Mapping[str, PoblacionDelEstudio],
    ) -> tuple[AplicabilidadDeFuente, ...]:
        return ()  # esqueleto (L1D-127): el comportamiento llega con el commit feat
