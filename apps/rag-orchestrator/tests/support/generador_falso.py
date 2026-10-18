"""FX-06a-b: ``FakeEvidenceGenerator``, el generador falso que reutilizan L1D-179, L1D-275 y L1D-180.

Cada escenario modela la salida cruda del LLM (con los metadatos que un LLM podría inventar) y el fake la parsea como
lo hará el parseo real: solo sobrevive el ``chunkId`` de cada cita (RN-04). Cumple el contrato del puerto
``EvidenceGenerator``: devuelve ``EvidenciaGenerada`` y cuenta cada invocación.
"""

from __future__ import annotations

from typing import Any

from app.application.ports import EvidenciaGenerada, ResultadoDeRecuperacion
from app.domain.citations import OpcionGenerada
from app.schemas.generated.models import RagQueryInternalRequest

OPCION_ANTI_HER2 = "Quimioterapia adyuvante combinada con terapia dirigida anti-HER2"
RAZON_ANTI_HER2 = (
    "La evidencia recuperada describe la adición de terapia anti-HER2 a la quimioterapia adyuvante."
)
TITULO_INVENTADO = "Guía NCCN 2026"


def _opcion(citas: list[dict[str, Any]]) -> dict[str, Any]:
    return {"option": OPCION_ANTI_HER2, "rationale": RAZON_ANTI_HER2, "citedSources": citas}


ESCENARIOS: dict[str, list[dict[str, Any]]] = {
    "LLM-OK": [_opcion([{"chunkId": "ch-m1-1"}])],
    "LLM-CITA-AJENA": [_opcion([{"chunkId": "ch-x-999"}])],
    "LLM-TITULO-FALSO": [
        _opcion([{"chunkId": "ch-m1-1", "title": TITULO_INVENTADO, "sourceName": "NCCN"}])
    ],
    "LLM-SIN-CITAS": [_opcion([])],
    "LLM-CITA-MIXTA": [_opcion([{"chunkId": "ch-m1-1"}, {"chunkId": "ch-x-999"}])],
}


def _parsear(opciones_crudas: list[dict[str, Any]]) -> tuple[OpcionGenerada, ...]:
    return tuple(
        OpcionGenerada(
            option=cruda["option"],
            rationale=cruda["rationale"],
            chunk_ids_citados=tuple(cita["chunkId"] for cita in cruda["citedSources"]),
        )
        for cruda in opciones_crudas
    )


class FakeEvidenceGenerator:
    """``EvidenceGenerator`` con salidas fijas por escenario y contador de invocaciones (FX-06b)."""

    def __init__(self, escenario: str = "LLM-OK") -> None:
        self._opciones = _parsear(ESCENARIOS[escenario])
        self.recuperaciones: list[ResultadoDeRecuperacion] = []

    @property
    def invocaciones(self) -> int:
        return len(self.recuperaciones)

    async def generar(
        self, solicitud: RagQueryInternalRequest, recuperacion: ResultadoDeRecuperacion
    ) -> EvidenciaGenerada:
        self.recuperaciones.append(recuperacion)
        return EvidenciaGenerada(opciones=self._opciones)
