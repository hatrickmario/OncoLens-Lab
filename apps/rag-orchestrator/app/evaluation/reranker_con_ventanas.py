"""Lo que la suite ``evaluate`` exige a un reranker para comparar brazos de ventanas (US-278): el contrato, en un solo lugar.

``Reranker`` (el puerto de ``application/``) no conoce las ventanas: la etapa (modo, solape, largo) es un asunto de los adapters
y de la suite. Este protocolo es el Extract Interface de lo que antes se pedía con ``getattr``: lo cumplen ``BgeReranker``,
``RerankerLexico`` y ``RerankerRegistrado``; un reranker sin etapa (``RerankerFalso``) no lo cumple y la suite lo rechaza
nombrando la causa.
"""

from __future__ import annotations

from typing import Protocol, runtime_checkable

from app.application.ports import Reranker
from app.domain.ventanas_del_reranker import ConfiguracionDelReranker, ModoDeVentanas


@runtime_checkable
class RerankerConVentanas(Reranker, Protocol):
    @property
    def configuracion(self) -> ConfiguracionDelReranker | None:
        """La etapa con la que corre (modo, solape, largo y pares); ``None`` si el adapter envuelto no la tiene."""
        ...

    def variante(
        self,
        *,
        modo_de_ventanas: ModoDeVentanas | None = None,
        solape: int | None = None,
        max_length: int | None = None,
    ) -> RerankerConVentanas:
        """El mismo reranker, sobre los mismos modelos ya cargados, con la etapa cambiada; ``None`` conserva el valor."""
        ...
