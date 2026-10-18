"""Adapter de bge-reranker-v2-m3 (int8, CPU/ONNX; ADR-39): puntaje por candidato ya normalizado a [0, 1] (RN-03)."""

from __future__ import annotations

from collections.abc import Sequence

from app.application.ports import ChunkEncontrado
from app.infrastructure.models.sesion import SesionDeInferencia, Tokenizador


class BgeReranker:
    """``Reranker``."""

    def __init__(
        self,
        sesion: SesionDeInferencia,
        tokenizador: Tokenizador,
        *,
        version: str,
        max_length: int,
        max_pairs: int,
        max_tokens_por_lote: int,
    ) -> None:
        raise NotImplementedError

    @property
    def version(self) -> str:
        raise NotImplementedError

    def puntuar(self, pregunta: str, candidatos: Sequence[ChunkEncontrado]) -> list[float]:
        raise NotImplementedError
