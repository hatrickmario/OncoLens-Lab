"""Nodo ``evidencia`` del grafo del chat (US-265, ADR-51): el análisis de evidencia dentro de la conversación.

Sustituye el esqueleto de la intención ``evidencia`` (se inyecta en ``construir_grafo(capacidades=...)``).
"""

from __future__ import annotations

from typing import Any

from app.application.chat.grafo import EstadoDelGrafo
from app.application.ports import ConsultaDeEvidencia, PosicionDeChunks


class NodoEvidencia:
    def __init__(self, *, consulta: ConsultaDeEvidencia, posiciones: PosicionDeChunks) -> None:
        self._consulta = consulta
        self._posiciones = posiciones

    async def ejecutar(self, estado: EstadoDelGrafo) -> dict[str, Any]:
        raise NotImplementedError("no implementado")
