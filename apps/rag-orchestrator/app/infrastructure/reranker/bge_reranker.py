"""Adapter de bge-reranker-v2-m3 (int8, CPU/ONNX; ADR-39): puntaje por candidato ya normalizado a [0, 1] (RN-03)."""

from __future__ import annotations

from collections.abc import Sequence

import numpy as np

from app.application.ports import CandidatoParaReranker, FalloDeInferencia
from app.domain.normalizacion_puntaje import normalizar_a_unidad
from app.infrastructure.models.fallos import fallos_de_inferencia_como_error_del_puerto
from app.infrastructure.models.lotes import (
    agrupar_por_presupuesto_de_tokens,
    truncar_conservando_el_separador_final,
)
from app.infrastructure.models.sesion import SesionDeInferencia, Tokenizador

_FALLO = "reranker: fallo de inferencia del modelo local"
_EXCESO_DE_PARES = "reranker: más pares que RERANKER_MAX_PAIRS"


class BgeReranker:
    """``Reranker``: nunca devuelve ``None`` ni un ``0.0`` por defecto; si no puede puntuar, lanza el error del puerto."""

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
        self._sesion = sesion
        self._tokenizador = tokenizador
        self._version = version
        self._max_length = max_length
        self._max_pairs = max_pairs
        self._max_tokens_por_lote = max_tokens_por_lote

    @property
    def version(self) -> str:
        return self._version

    def puntuar(self, pregunta: str, candidatos: Sequence[CandidatoParaReranker]) -> list[float]:
        if len(candidatos) > self._max_pairs:
            raise FalloDeInferencia(_EXCESO_DE_PARES)
        if not candidatos:
            return []
        with fallos_de_inferencia_como_error_del_puerto(_FALLO):
            return self._puntuar_pares(pregunta, [c.chunk_text for c in candidatos])

    def _puntuar_pares(self, pregunta: str, pasajes: list[str]) -> list[float]:
        secuencias = [
            truncar_conservando_el_separador_final(
                self._tokenizador.codificar(pregunta, pasaje), self._max_length
            )
            for pasaje in pasajes
        ]
        logits: list[float | None] = [None] * len(secuencias)
        for lote in agrupar_por_presupuesto_de_tokens(secuencias, self._max_tokens_por_lote):
            salida = self._sesion.ejecutar([secuencias[i] for i in lote])
            for indice, logit in zip(lote, self._logits_del_lote(salida, len(lote))):
                logits[indice] = logit
        if any(logit is None for logit in logits):  # un hueco jamás se disfraza de un logit 0.0
            raise FalloDeInferencia(_FALLO)
        return normalizar_a_unidad([logit for logit in logits if logit is not None])

    @staticmethod
    def _logits_del_lote(salida: np.ndarray, tamano: int) -> list[float]:
        """Un logit finito por par: otra forma, un NaN o un infinito rompen el contrato en vez de disfrazarse de 0.0."""
        logits = np.asarray(salida, dtype=np.float64)
        if logits.shape not in ((tamano,), (tamano, 1)) or not np.isfinite(logits).all():
            raise FalloDeInferencia(_FALLO)
        return logits.reshape(-1).tolist()
