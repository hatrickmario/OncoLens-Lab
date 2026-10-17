"""Admisibilidad de un documento de la semilla por fuente y licencia (RN-21, D-09, ADR-36)."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from enum import StrEnum

from app.domain.corpus_seed.documento import DocumentoDeSemilla


class MotivoDeRechazo(StrEnum):
    FUENTE_EXCLUIDA = "fuente_excluida"
    SIN_LICENCIA = "sin_licencia"
    LICENCIA_NO_ACEPTADA = "licencia_no_aceptada"


@dataclass(frozen=True)
class PoliticaDeLicencias:
    """Lo que la configuración (RN-22) decide: clases aceptadas, fuentes excluidas y la tabla licencia -> clase."""

    aceptadas: frozenset[str]
    excluidas: tuple[str, ...]
    mapa_de_clases: Mapping[str, str]
    permitir_cc_by_nc: bool = False


@dataclass(frozen=True)
class Admision:
    motivo: MotivoDeRechazo | None
    license_class: str | None = None

    @property
    def admitido(self) -> bool:
        return self.motivo is None


def evaluar_admisibilidad(documento: DocumentoDeSemilla, politica: PoliticaDeLicencias) -> Admision:
    raise NotImplementedError("no implementado")
