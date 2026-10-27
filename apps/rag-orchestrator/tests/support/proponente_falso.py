"""LLM falso de aplicabilidad de FX-08b-a (US-123): ``ApplicabilityTextProposer`` con guiones fijos por escenario.

Cumple el contrato del adapter real: devuelve solo propuestas ``(fuente, criterio, valor, chunkId)``, nunca estado ni
``patientValue``, y solo habla de las fuentes que recibió. Registra las llamadas para comprobar que no se invoca
cuando no hay criterios pendientes (RN-02, US-122 AC-6).
"""

from __future__ import annotations

from collections.abc import Sequence

from app.domain.applicability_text import (
    FuenteParaProponer,
    PropuestaDePoblacion,
    normalizar_propuesta,
)
from tests.support.aplicabilidad import external_id_de

CITA_AJENA = "ch-x-999"  # no es un chunk recuperado en ninguna consulta de los tests


def _her2_negativo(chunk_id: str) -> PropuestaDePoblacion:
    return PropuestaDePoblacion(external_id_de("doc-a2"), "estado_her2", "HER2 negativo", chunk_id)


_GUIONES: dict[str, tuple[PropuestaDePoblacion, ...]] = {
    "APL-OK": (_her2_negativo("ch-a2-1"),),
    "APL-SIN-SOPORTE": (
        PropuestaDePoblacion(external_id_de("doc-a2"), "estadio", "estadio I–III", "ch-a2-1"),
    ),
    "APL-CITA-AJENA": (_her2_negativo(CITA_AJENA),),
    "APL-SILENCIO": (),
    # Valores descuidados de un LLM real (contrato común con el adapter, test_contrato_del_proponente.py).
    "APL-CRUDO": (
        PropuestaDePoblacion(
            external_id_de("doc-a2"), "estado_her2", "  HER2 negativo \n", "ch-a2-1"
        ),
        PropuestaDePoblacion(external_id_de("doc-a2"), "estado_her2", "   ", "ch-a2-1"),
        PropuestaDePoblacion(external_id_de("doc-a2"), "estado_her2", "HER2 negativo", ""),
        PropuestaDePoblacion(external_id_de("doc-a2"), "estado_her2", "x" * 201, "ch-a2-1"),
    ),
}


class ProponenteFalso:
    def __init__(self, escenario: str = "APL-SILENCIO", error: Exception | None = None) -> None:
        self._guion = _GUIONES[escenario]
        self.error = error
        self.llamadas: list[tuple[FuenteParaProponer, ...]] = []

    @property
    def invocaciones(self) -> int:
        return len(self.llamadas)

    async def proponer(
        self, fuentes: Sequence[FuenteParaProponer]
    ) -> tuple[PropuestaDePoblacion, ...]:
        self.llamadas.append(tuple(fuentes))
        if self.error is not None:
            raise self.error
        recibidas = {f.external_id for f in fuentes}
        # Como el adapter real: la misma normalizacion del dominio (LSP).
        normalizadas = (
            normalizar_propuesta(p.external_id, p.criterio, p.valor, p.chunk_id)
            for p in self._guion
            if p.external_id in recibidas
        )
        return tuple(p for p in normalizadas if p is not None)
