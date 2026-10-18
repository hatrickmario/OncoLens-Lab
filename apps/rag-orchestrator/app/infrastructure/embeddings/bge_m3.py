"""Adapter de BGE-M3 (int8, CPU/ONNX; ADR-39): un núcleo, dos puertos (``QueryEmbedder`` y ``PassageEmbedder``).

Los puertos comparten el nombre ``embeber`` con firmas incompatibles (un texto frente a una lista), así que cada uno es
una fachada delgada del mismo ``NucleoBgeM3``: una sola sesión de modelo y solo cambia el prefijo del texto.
BGE-M3 no exige prefijos (ADR-39): los de pregunta y pasaje son configuración, vacíos por defecto.
"""

from __future__ import annotations

from collections.abc import Sequence

import numpy as np

from app.application.ports import FalloDeInferencia
from app.infrastructure.models.fallos import fallos_de_inferencia_como_error_del_puerto
from app.infrastructure.models.lotes import (
    agrupar_por_presupuesto_de_tokens,
    truncar_conservando_el_separador_final,
)
from app.infrastructure.models.sesion import SesionDeInferencia, Tokenizador

_FALLO = "embeddings: fallo de inferencia del modelo local"


class NucleoBgeM3:
    def __init__(
        self,
        sesion: SesionDeInferencia,
        tokenizador: Tokenizador,
        *,
        modelo: str,
        dimension: int,
        max_length: int,
        max_tokens_por_lote: int,
        prefijo_consulta: str = "",
        prefijo_pasaje: str = "",
    ) -> None:
        self._sesion = sesion
        self._tokenizador = tokenizador
        self._modelo = modelo
        self._dimension = dimension
        self._max_length = max_length
        self._max_tokens_por_lote = max_tokens_por_lote
        self._prefijo_consulta = prefijo_consulta
        self._prefijo_pasaje = prefijo_pasaje

    @property
    def modelo(self) -> str:
        return self._modelo

    def vectorizar_consulta(self, texto: str) -> list[float]:
        return self._vectorizar([texto], self._prefijo_consulta)[0]

    def vectorizar_pasajes(self, textos: Sequence[str]) -> list[list[float]]:
        return self._vectorizar(textos, self._prefijo_pasaje)

    def _vectorizar(self, textos: Sequence[str], prefijo: str) -> list[list[float]]:
        if not textos:
            return []
        with fallos_de_inferencia_como_error_del_puerto(_FALLO):
            secuencias = [
                truncar_conservando_el_separador_final(
                    self._tokenizador.codificar(prefijo + t), self._max_length
                )
                for t in textos
            ]
            vectores: list[list[float] | None] = [None] * len(secuencias)
            for lote in agrupar_por_presupuesto_de_tokens(secuencias, self._max_tokens_por_lote):
                salida = self._sesion.ejecutar([secuencias[i] for i in lote])
                for indice, vector in zip(lote, self._vectores_del_lote(salida, len(lote))):
                    vectores[indice] = vector
        return [v for v in vectores if v is not None]

    def _vectores_del_lote(self, salida: np.ndarray, tamano: int) -> list[list[float]]:
        """Pooling CLS y normalización L2; una forma o dimensión inesperada rompe el contrato del puerto."""
        if salida.ndim != 3 or salida.shape[0] != tamano or salida.shape[2] != self._dimension:
            raise FalloDeInferencia(_FALLO)
        cls = salida[:, 0, :].astype(np.float64)
        normas = np.maximum(np.linalg.norm(cls, axis=1, keepdims=True), 1e-12)
        return (cls / normas).tolist()


class EmbedderDeConsultaBgeM3:
    """``QueryEmbedder``."""

    def __init__(self, nucleo: NucleoBgeM3) -> None:
        self._nucleo = nucleo

    @property
    def modelo(self) -> str:
        return self._nucleo.modelo

    def embeber(self, texto: str) -> Sequence[float]:
        return self._nucleo.vectorizar_consulta(texto)


class EmbedderDePasajesBgeM3:
    """``PassageEmbedder``."""

    def __init__(self, nucleo: NucleoBgeM3) -> None:
        self._nucleo = nucleo

    def embeber(self, textos: Sequence[str]) -> list[list[float]]:
        return self._nucleo.vectorizar_pasajes(textos)
