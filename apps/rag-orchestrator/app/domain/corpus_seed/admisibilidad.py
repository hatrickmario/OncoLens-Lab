"""Admisibilidad de un documento de la semilla por fuente y licencia (RN-21, D-09, ADR-36)."""

from __future__ import annotations

import re
from collections.abc import Mapping
from dataclasses import dataclass
from enum import StrEnum

from app.domain.corpus_seed.documento import DocumentoDeSemilla


# "ND" como palabra aparte ("CC BY-ND", "by-nc-nd"): no casa dentro de otra palabra.
_CLAUSULA_ND = re.compile(r"(?<![a-z])nd(?![a-z])", re.IGNORECASE)


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
    if not documento.license:
        return Admision(MotivoDeRechazo.SIN_LICENCIA)
    clase = clase_de_licencia(documento.license, politica.mapa_de_clases)
    if clase not in politica.aceptadas or not _cumple_condiciones_de_nc(clase, documento, politica):
        return Admision(MotivoDeRechazo.LICENCIA_NO_ACEPTADA)
    return Admision(None, clase)


def _cumple_condiciones_de_nc(
    clase: str | None, documento: DocumentoDeSemilla, politica: PoliticaDeLicencias
) -> bool:
    """CC BY-NC solo en el MVP académico (RN-21): además de estar aceptada exige ``ALLOW_CC_BY_NC`` y la marca del documento."""
    if clase != "cc_by_nc":
        return True
    return politica.permitir_cc_by_nc and documento.nc_solo_academico


def normalizar_clave(texto: str) -> str:
    """Forma de comparación de licencias y fuentes: sin mayúsculas, sin espacios de los extremos ni repetidos."""
    return " ".join(texto.casefold().split())


def clase_de_licencia(licencia: str, mapa_de_clases: Mapping[str, str]) -> str | None:
    """``license_class`` del texto literal de la licencia según la tabla de configuración; ``None`` si no mapea.

    Una licencia ND no tiene clase aunque la tabla la contuviera por error: se rechaza siempre (RN-21).
    """
    if _CLAUSULA_ND.search(licencia):
        return None
    tabla = {normalizar_clave(texto): clase for texto, clase in mapa_de_clases.items()}
    return tabla.get(normalizar_clave(licencia))
