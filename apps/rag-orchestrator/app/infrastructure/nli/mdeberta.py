"""Adapter de mDeBERTa-v3-base-xnli-multilingual-nli-2mil7 (fp32, CPU/ONNX; ADR-39): puerto ``NliClassifier``."""

from __future__ import annotations

from app.application.ports import ParNli, ResultadoNli
from app.domain.nli import IndicesDeClase, ProbabilidadesNli
from app.infrastructure.models.sesion import SesionDeInferencia, Tokenizador


class ClasificadorNliMdeberta:
    """``NliClassifier``: nunca devuelve ``None`` ni una etiqueta por defecto; si no puede clasificar, lanza el error del puerto."""

    def __init__(
        self,
        sesion: SesionDeInferencia,
        tokenizador: Tokenizador,
        *,
        version: str,
        indices: IndicesDeClase,
        max_length: int,
        max_tokens_por_lote: int,
    ) -> None:
        self._sesion = sesion
        self._tokenizador = tokenizador
        self._version = version
        self._indices = indices
        self._max_length = max_length
        self._max_tokens_por_lote = max_tokens_por_lote

    @property
    def version(self) -> str:
        raise NotImplementedError("no implementado")

    def clasificar(self, pares: list[ParNli]) -> list[ResultadoNli]:
        raise NotImplementedError("no implementado")

    def probabilidades(self, pares: list[ParNli]) -> list[ProbabilidadesNli]:
        raise NotImplementedError("no implementado")
