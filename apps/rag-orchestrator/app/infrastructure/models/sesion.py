"""Bordes de inferencia de los adapters de modelos locales (US-231a).

Los adapters (``embeddings/``, ``reranker/``) reciben estos dos puertos y no importan ``onnxruntime`` ni ``tokenizers``:
el runtime real los implementa en ``onnx.py`` y los tests usan dobles deterministas (sin pesos, RN-14).
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Protocol

import numpy as np


class Tokenizador(Protocol):
    @property
    def id_relleno(self) -> int:
        """Id del token de relleno con el que la sesión alinea secuencias de largo distinto."""
        ...

    def codificar(self, texto: str, par: str | None = None) -> list[int]:
        """Ids con los tokens especiales del modelo; con ``par``, la pareja (pregunta, pasaje) del cross-encoder."""
        ...


class SesionDeInferencia(Protocol):
    def ejecutar(self, secuencias: Sequence[Sequence[int]]) -> np.ndarray:
        """Una pasada del modelo sobre ids sin relleno (largos distintos). Devuelve el tensor de salida del lote,
        en el orden recibido: estados ocultos ``[lote, tokens, dim]`` (embeddings) o logits ``[lote, 1]`` (reranker)."""
        ...
