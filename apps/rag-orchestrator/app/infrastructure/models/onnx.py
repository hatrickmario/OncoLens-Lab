"""Implementación real de los bordes de inferencia sobre ONNX Runtime (CPU) y ``tokenizers`` (ADR-39).

Todo se carga de rutas locales ya verificadas (``Tokenizer.from_file``, ``InferenceSession(<ruta local>)``): nada
consulta un hub ni descarga pesos (RN-12). Los hilos de ONNX Runtime salen de la configuración y la ejecución es
secuencial, para que el mismo par dé el mismo puntaje en procesos distintos (IA-07).
"""

from __future__ import annotations

from collections.abc import Sequence
from pathlib import Path
from typing import Any

import numpy as np
import onnxruntime as ort
from tokenizers import Tokenizer

TOKEN_DE_RELLENO = "<pad>"


def crear_opciones_de_sesion(hilos: int) -> ort.SessionOptions:
    opciones = ort.SessionOptions()
    opciones.intra_op_num_threads = hilos
    opciones.inter_op_num_threads = 1
    opciones.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
    return opciones


class SesionOnnx:
    """``SesionDeInferencia`` sobre una sesión de ONNX Runtime ya creada (entradas ``input_ids`` y ``attention_mask``)."""

    def __init__(self, sesion_ort: Any, id_relleno: int) -> None:
        self._sesion = sesion_ort
        self._id_relleno = id_relleno

    @classmethod
    def desde_archivo(cls, ruta: Path, *, hilos: int, id_relleno: int) -> SesionOnnx:
        sesion = ort.InferenceSession(
            str(ruta),
            sess_options=crear_opciones_de_sesion(hilos),
            providers=["CPUExecutionProvider"],
        )
        return cls(sesion, id_relleno)

    def ejecutar(self, secuencias: Sequence[Sequence[int]]) -> np.ndarray:
        largo = max(len(s) for s in secuencias)
        ids = np.full((len(secuencias), largo), self._id_relleno, dtype=np.int64)
        mascara = np.zeros((len(secuencias), largo), dtype=np.int64)
        for fila, secuencia in enumerate(secuencias):
            ids[fila, : len(secuencia)] = secuencia
            mascara[fila, : len(secuencia)] = 1
        return np.asarray(self._sesion.run(None, {"input_ids": ids, "attention_mask": mascara})[0])


class TokenizadorDeArchivo:
    """``Tokenizador`` cargado de un ``tokenizer.json`` local (``Tokenizer.from_file``): jamás consulta un hub."""

    def __init__(self, ruta: Path) -> None:
        self._tokenizador = Tokenizer.from_file(str(ruta))
        self._tokenizador.no_truncation()  # el recorte lo decide el adapter (RERANKER_MAX_LENGTH, EMBEDDING_MAX_LENGTH)
        self._tokenizador.no_padding()
        id_relleno = self._tokenizador.token_to_id(TOKEN_DE_RELLENO)
        if id_relleno is None:
            raise ValueError("el tokenizer no define el token de relleno")
        self._id_relleno = id_relleno

    @property
    def id_relleno(self) -> int:
        return self._id_relleno

    def codificar(self, texto: str, par: str | None = None) -> list[int]:
        codificacion = (
            self._tokenizador.encode(texto) if par is None else self._tokenizador.encode(texto, par)
        )
        return list(codificacion.ids)
