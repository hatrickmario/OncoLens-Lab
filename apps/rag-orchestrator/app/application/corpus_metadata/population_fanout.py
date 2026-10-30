"""Extracción de la población del estudio en abanico (US-242, ADR-47): esqueleto del test en rojo."""

from __future__ import annotations

from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass

from app.application.corpus_metadata.poblacion_puertos import (
    DocumentoParaExtraer,
    LlmDePoblacion,
    PoblacionExtraida,
    PoblacionGuardada,
    RecuperadorDeFragmentos,
)
from app.application.ports import NliClassifier
from app.domain.criterios_aplicabilidad import CriteriosDeAplicabilidad


@dataclass(frozen=True)
class ConfiguracionDePoblacion:
    """Lo que la configuración (RN-22) y las versiones fijan en una corrida de extracción."""

    top_k: int
    max_valores_por_criterio: int
    max_tokens_de_salida: int
    concurrencia: int
    reintentos: int
    version_del_prompt: str
    version_del_modelo: str
    version_del_catalogo: str
    umbral_nli: float


class PopulationFanoutExtractor:
    def __init__(
        self,
        *,
        llm: LlmDePoblacion,
        nli: NliClassifier,
        recuperador: RecuperadorDeFragmentos,
        criterios: CriteriosDeAplicabilidad,
        plantilla_del_prompt: str,
        sinonimos: Mapping[str, str],
        buscar_terminos_prohibidos: Callable[[str], Sequence[str]],
        configuracion: ConfiguracionDePoblacion,
    ) -> None:
        self._configuracion = configuracion

    def extraer(
        self,
        documento: DocumentoParaExtraer,
        tipos_de_cancer: Sequence[str],
        guardado: PoblacionGuardada | None,
    ) -> PoblacionExtraida:
        raise NotImplementedError
