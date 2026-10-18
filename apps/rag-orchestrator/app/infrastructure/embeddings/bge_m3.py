"""Adapter de BGE-M3 (int8, CPU/ONNX; ADR-39): un núcleo, dos puertos (``QueryEmbedder`` y ``PassageEmbedder``).

Los puertos comparten el nombre ``embeber`` con firmas incompatibles (un texto frente a una lista), así que cada uno es
una fachada delgada del mismo ``NucleoBgeM3``: una sola sesión de modelo y solo cambia el prefijo del texto.
BGE-M3 no exige prefijos (ADR-39): los de pregunta y pasaje son configuración, vacíos por defecto.
"""

from __future__ import annotations

from collections.abc import Sequence

import numpy as np

from app.application.ports import FalloDeInferencia
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
        try:
            secuencias = [self._truncar(self._tokenizador.codificar(prefijo + t)) for t in textos]
            vectores: list[list[float] | None] = [None] * len(secuencias)
            for lote in self._lotes_por_presupuesto(secuencias):
                salida = self._sesion.ejecutar([secuencias[i] for i in lote])
                for indice, vector in zip(lote, self._vectores_del_lote(salida, len(lote))):
                    vectores[indice] = vector
        except FalloDeInferencia:
            raise
        except Exception:  # noqa: BLE001 - cualquier fallo del runtime es "modelo no disponible"
            raise FalloDeInferencia(_FALLO) from None
        return [v for v in vectores if v is not None]

    def _truncar(self, ids: list[int]) -> list[int]:
        """Conserva el token especial final (separador) al recortar, como en la medición de ADR-39."""
        if len(ids) <= self._max_length:
            return ids
        return [*ids[: self._max_length - 1], ids[-1]]

    def _lotes_por_presupuesto(self, secuencias: list[list[int]]) -> list[list[int]]:
        """Índices agrupados por largo creciente sin pasar del presupuesto de tokens (relleno incluido)."""
        lotes: list[list[int]] = []
        actual: list[int] = []
        for indice in sorted(range(len(secuencias)), key=lambda i: (len(secuencias[i]), i)):
            if actual and (len(actual) + 1) * len(secuencias[indice]) > self._max_tokens_por_lote:
                lotes.append(actual)
                actual = []
            actual.append(indice)
        if actual:
            lotes.append(actual)
        return lotes

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
