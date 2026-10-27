"""``AplicabilidadTextual``: camino textual de la aplicabilidad (US-123, design D8). ESQUELETO del commit en rojo.

Devuelve la aplicabilidad estructurada sin cambios; el comportamiento llega con el commit ``feat(L1D-128)``.
"""

from collections.abc import Mapping
from dataclasses import dataclass

from app.application.aplicabilidad import AplicabilidadDeFuente, ApplicabilityService
from app.application.chunk_citable import ChunkCitable
from app.application.ports import ApplicabilityTextProposer, ProhibitedTermsChecker
from app.application.verificacion_de_soporte import VerificadorDeSoporte


@dataclass(frozen=True)
class AplicabilidadCompleta:
    """La aplicabilidad de las fuentes con el camino textual aplicado, las afirmaciones omitidas y si hubo llamada al LLM."""

    fuentes: tuple[AplicabilidadDeFuente, ...]
    omitidas: int = 0
    invoco_al_llm: bool = False


class AplicabilidadTextual:
    def __init__(
        self,
        *,
        proponente: ApplicabilityTextProposer,
        soporte: VerificadorDeSoporte,
        terminos: ProhibitedTermsChecker,
        estructurada: ApplicabilityService,
    ) -> None:
        self._proponente = proponente
        self._soporte = soporte
        self._terminos = terminos
        self._estructurada = estructurada

    async def completar(
        self,
        trace_id: str,
        tipo_de_cancer: str,
        fuentes: tuple[AplicabilidadDeFuente, ...],
        citables: Mapping[str, ChunkCitable],
    ) -> AplicabilidadCompleta:
        return AplicabilidadCompleta(fuentes)
