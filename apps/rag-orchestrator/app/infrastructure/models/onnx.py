"""Implementación real de los bordes de inferencia sobre ONNX Runtime (CPU) y ``tokenizers`` (ADR-39).

Todo se carga de archivos locales ya verificados: el tokenizer con ``Tokenizer.from_file(<ruta local>)`` y la sesión de
ONNX Runtime desde los BYTES que se hashearon (``InferenceSession(contenido)``), nunca desde una ruta sin verificar:
así se carga exactamente lo verificado y un ``.data`` vecino no declarado no entra (US-231b D12). Nada consulta un hub
ni descarga pesos (RN-12). Los hilos de ONNX Runtime salen de la configuración y la ejecución es secuencial, para que
el mismo par dé el mismo puntaje en procesos distintos (IA-07).
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import Any

import numpy as np
import onnxruntime as ort
from tokenizers import Tokenizer

# Orden de búsqueda del relleno cuando el tokenizer.json no declara su `padding`: BGE-M3 usa `<pad>`, mDeBERTa `[PAD]`.
TOKENS_DE_RELLENO = ("<pad>", "[PAD]")


# Clave `location` de un `external_data` de ONNX (StringStringEntryProto): campo 1, 8 bytes. Solo sirve para elegir qué
# variable nombrar cuando la sesión no se puede crear; ONNX Runtime ya rechaza el modelo (falla cerrado).
_CLAVE_DE_DATOS_EXTERNOS = b"\x0a\x08location"


class DatosExternosNoResueltos(RuntimeError):
    """El ONNX referencia datos externos (``*.onnx.data``) que no se declararon, verificaron o resolvieron. Sin ruta."""


def _referencia_datos_externos(contenido: bytes) -> bool:
    return _CLAVE_DE_DATOS_EXTERNOS in contenido


def crear_opciones_de_sesion(hilos: int) -> ort.SessionOptions:
    opciones = ort.SessionOptions()
    opciones.intra_op_num_threads = hilos
    opciones.inter_op_num_threads = 1
    opciones.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
    return opciones


class SesionOnnx:
    """``SesionDeInferencia`` sobre una sesión de ONNX Runtime ya creada (entradas ``input_ids`` y ``attention_mask``)."""

    def __init__(
        self, sesion_ort: Any, id_relleno: int, datos_externos: Mapping[str, bytes] | None = None
    ) -> None:
        self._sesion = sesion_ort
        self._id_relleno = id_relleno
        # ONNX Runtime no copia los datos externos: los buffers deben vivir tanto como la sesión.
        self._datos_externos = dict(datos_externos or {})

    @classmethod
    def desde_bytes(
        cls,
        contenido: bytes,
        *,
        hilos: int,
        id_relleno: int,
        datos_externos: Mapping[str, bytes] | None = None,
    ) -> SesionOnnx:
        """Sesión desde los bytes verificados. ``datos_externos`` mapea la ubicación que el ONNX referencia a los bytes
        de su archivo de datos, también verificados; un dato externo no declarado hace fallar la creación."""
        datos = dict(datos_externos or {})
        opciones = crear_opciones_de_sesion(hilos)
        if datos:
            opciones.add_external_initializers_from_files_in_memory(
                list(datos), list(datos.values()), [len(valor) for valor in datos.values()]
            )
        try:
            sesion = ort.InferenceSession(
                contenido, sess_options=opciones, providers=["CPUExecutionProvider"]
            )
        except Exception:
            if _referencia_datos_externos(contenido):
                raise DatosExternosNoResueltos("el ONNX referencia datos externos") from None
            raise
        return cls(sesion, id_relleno, datos)

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
        self._id_relleno = self._leer_id_de_relleno()
        self._tokenizador.no_truncation()  # el recorte lo decide el adapter (RERANKER_MAX_LENGTH, EMBEDDING_MAX_LENGTH)
        self._tokenizador.no_padding()

    def _leer_id_de_relleno(self) -> int:
        """El relleno sale del propio tokenizer.json (ya verificado por SHA-256): su `padding` si lo declara o, si no,
        el primer token especial de ``TOKENS_DE_RELLENO`` que defina su vocabulario."""
        padding = self._tokenizador.padding
        if padding is not None:
            return int(padding["pad_id"])
        for token in TOKENS_DE_RELLENO:
            id_relleno = self._tokenizador.token_to_id(token)
            if id_relleno is not None:
                return id_relleno
        raise ValueError("el tokenizer no define el token de relleno")

    @property
    def id_relleno(self) -> int:
        return self._id_relleno

    def codificar(self, texto: str, par: str | None = None) -> list[int]:
        codificacion = (
            self._tokenizador.encode(texto) if par is None else self._tokenizador.encode(texto, par)
        )
        return list(codificacion.ids)
