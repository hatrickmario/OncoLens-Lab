"""``ChatCitation`` de los bloques `evidencia` (US-265, RN-04, RN-25): las arma el código, nunca el LLM.

``documentId``, ``chunkOrdinal`` y ``chunkCount`` salen del corpus (Milvus, por ``PosicionDeChunks``); el título y el texto
del fragmento, de la ficha del catálogo y del chunk recuperado en el turno. Un chunk sin posición vigente no puede citarse:
el turno falla cerrado con ``503 RETRIEVAL_UNAVAILABLE``, sin respuesta parcial.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import NamedTuple

from app.application.errores import RecuperacionNoDisponibleError
from app.application.ports import PosicionDeChunks
from app.application.rag_orchestrator_service import RAGOrchestratorService
from app.domain.chat.turno import CitaDelBloque


class FuenteDeCita(NamedTuple):
    """Lo que ya se sabe de un chunk citado en este turno: su id, el título de su ficha y su texto original."""

    chunk_id: str
    titulo: str
    texto: str


class ConstructorDeCitas:
    def __init__(self, posiciones: PosicionDeChunks) -> None:
        self._posiciones = posiciones

    async def construir(
        self, trace_id: str, fuentes: Sequence[FuenteDeCita]
    ) -> dict[str, CitaDelBloque]:
        """Una ``CitaDelBloque`` por ``chunkId`` citado, en el orden de ``fuentes`` (sin repetir)."""
        ids = {f.chunk_id for f in fuentes}
        if not ids:
            return {}
        posiciones = await RAGOrchestratorService.invocar_borde_fallando_cerrado(
            trace_id, "posiciones", self._posiciones.posiciones, ids
        )
        if not ids <= posiciones.keys():
            raise RecuperacionNoDisponibleError("posiciones")
        return {
            f.chunk_id: CitaDelBloque(
                f.chunk_id,
                posiciones[f.chunk_id].document_id,
                f.titulo,
                posiciones[f.chunk_id].ordinal,
                posiciones[f.chunk_id].cantidad,
                f.texto,
            )
            for f in fuentes
        }
