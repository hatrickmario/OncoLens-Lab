"""Resumen de la población del corpus por tipo de cáncer e idioma (US-120 AC-7, ADR-47): solo identificadores y contadores."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass

from app.application.seed_corpus.ports import RegistroDeDocumento
from app.domain.criterios_aplicabilidad import CriterioDeAplicabilidad


@dataclass(frozen=True)
class CeldaDePoblacion:
    """Documentos de un tipo e idioma y, por criterio, cuántos tienen ≥ 1 valor ``elegibilidad`` verificado.

    ``por_criterio`` es ``None`` (no ``0``) cuando no hay documentos: la celda está «sin documentos»."""

    documentos: int
    por_criterio: Mapping[str, int] | None

    @property
    def sin_documentos(self) -> bool:
        return self.documentos == 0


def resumir_poblacion_por_tipo_e_idioma(
    documentos: Sequence[RegistroDeDocumento],
    criterios: Mapping[str, Sequence[CriterioDeAplicabilidad]],
    idiomas: Sequence[str],
    max_valores: int,
) -> dict[str, dict[str, CeldaDePoblacion]]:
    raise NotImplementedError
