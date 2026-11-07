"""Nodo ``fuentes_limitaciones`` del grafo del chat (US-266, ADR-51): esqueleto."""

from __future__ import annotations

from typing import Any

from app.application.chat.grafo import EstadoDelGrafo
from app.application.ports import CorpusCatalogReader, CorpusReleaseReader, PosicionDeChunks


class NodoFuentesLimitaciones:
    def __init__(
        self,
        *,
        posiciones: PosicionDeChunks,
        catalogo: CorpusCatalogReader,
        lector_release: CorpusReleaseReader,
    ) -> None:
        self._posiciones = posiciones
        self._catalogo = catalogo
        self._lector_release = lector_release

    async def ejecutar(self, estado: EstadoDelGrafo) -> dict[str, Any]:
        raise NotImplementedError("no implementado")
