"""Implementación real de los bordes de inferencia sobre ONNX Runtime (CPU) y ``tokenizers`` (ADR-39)."""

from __future__ import annotations

from collections.abc import Sequence
from pathlib import Path
from typing import Any

import numpy as np
import onnxruntime as ort
from tokenizers import Tokenizer


def crear_opciones_de_sesion(hilos: int) -> ort.SessionOptions:
    raise NotImplementedError


class SesionOnnx:
    """``SesionDeInferencia`` sobre una sesión de ONNX Runtime ya creada."""

    def __init__(self, sesion_ort: Any, id_relleno: int) -> None:
        raise NotImplementedError

    @classmethod
    def desde_archivo(cls, ruta: Path, *, hilos: int, id_relleno: int) -> SesionOnnx:
        raise NotImplementedError

    def ejecutar(self, secuencias: Sequence[Sequence[int]]) -> np.ndarray:
        raise NotImplementedError


class TokenizadorDeArchivo:
    """``Tokenizador`` cargado de un ``tokenizer.json`` local (``Tokenizer.from_file``): jamás consulta un hub."""

    def __init__(self, ruta: Path) -> None:
        raise NotImplementedError

    @property
    def id_relleno(self) -> int:
        raise NotImplementedError

    def codificar(self, texto: str, par: str | None = None) -> list[int]:
        raise NotImplementedError


__all__ = ["SesionOnnx", "Tokenizer", "TokenizadorDeArchivo", "crear_opciones_de_sesion"]
