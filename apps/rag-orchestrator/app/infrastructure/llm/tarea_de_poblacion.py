"""``TareaDePoblacionLocal``: adapter de ``PoblacionTask`` sobre el LLM local de la tarea corta (US-244, ADR-47 etapa C)."""

from __future__ import annotations

from app.application.corpus_metadata.poblacion_puertos import LlmDePoblacion
from app.domain.applicability_text import FuenteParaProponer, PropuestaDePoblacion


class TareaDePoblacionLocal:
    def __init__(
        self,
        llm: LlmDePoblacion,
        *,
        plantilla: str,
        max_valores: int,
        max_tokens_de_salida: int,
        max_chars_fragmentos: int,
    ) -> None:
        self._llm = llm
        self._plantilla = plantilla
        self._max_valores = max_valores
        self._max_tokens_de_salida = max_tokens_de_salida
        self._max_chars_fragmentos = max_chars_fragmentos

    async def proponer(self, fuente: FuenteParaProponer) -> tuple[PropuestaDePoblacion, ...]:
        raise NotImplementedError("US-244 AC-1")
