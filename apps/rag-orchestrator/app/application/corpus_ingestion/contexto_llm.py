"""Variante ``llm`` del contexto del chunk (US-279, L1D-337, D6): una frase de contexto por chunk escrita por el LLM LOCAL.

Esqueleto: la implementación llega con el commit ``feat(L1D-337)`` de AC-4.
"""

from __future__ import annotations

from collections.abc import Sequence

from app.application.corpus_ingestion.ports import (
    EntradaDelGeneradorDeContexto,
    FraseDeContexto,
    GeneradorDeContextoDeChunk,
    ResultadoDeContexto,
)
from app.application.ports import LlmClient
from app.domain.corpus_seed.contexto_del_chunk import MetadatosDelContexto


class GeneradorLlmDeContexto:
    """``GeneradorDeContextoDeChunk`` sobre el LLM local."""

    def __init__(self, *, llm: LlmClient, max_chars: int) -> None:
        self._llm = llm
        self._max_chars = max_chars

    def generar(self, entrada: EntradaDelGeneradorDeContexto, chunk: str) -> FraseDeContexto:
        raise NotImplementedError("no implementado")


class ConstructorConLlm:
    """Variante ``llm``: prefijo determinista y frase validada; sin frase, solo el determinista."""

    def __init__(
        self,
        *,
        generador: GeneradorDeContextoDeChunk,
        max_chars: int,
        doc_max_chars: int,
        concurrencia: int,
    ) -> None:
        self._generador = generador

    def textos_a_embeber(
        self,
        metadatos: MetadatosDelContexto | None,
        fragmentos: Sequence[str],
        *,
        secciones: Sequence[str] | None = None,
        pendientes: Sequence[int] | None = None,
    ) -> ResultadoDeContexto:
        raise NotImplementedError("no implementado")
