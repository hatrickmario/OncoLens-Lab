"""Dobles deterministas del borde de inferencia (US-231a): sin pesos ni runtime, cumplen el mismo contrato que el real.

El tokenizador separa por palabras y las asigna a ids estables; la sesión de embeddings devuelve un vector de bolsa de
palabras en el token 0 (CLS) y la del reranker, un logit por par a partir de las palabras que comparten.
"""

from __future__ import annotations

import re
import zlib
from collections.abc import Sequence

import numpy as np

from tests.support.recuperacion import CORPUS_FX06A, Q_HER2

ID_CLS = 0
ID_SEP = 2
_PALABRA = re.compile(r"\w+", re.UNICODE)

# FX-06a-c (US-231a, US-231b): textos sintéticos de modelos reales; los dos primeros pasajes son los de FX-06a-a.
CH_M1_1 = next(c.texto for c in CORPUS_FX06A if c.chunk_id == "ch-m1-1")
CH_P1_1 = next(c.texto for c in CORPUS_FX06A if c.chunk_id == "ch-p1-1")
CH_C_1 = (
    "Cardiac function should be monitored during anti-HER2 therapy because of the risk of left ventricular "
    "dysfunction."
)
PASAJES_FX06AC = {"ch-m1-1": CH_M1_1, "ch-p1-1": CH_P1_1, "ch-c-1": CH_C_1}


def id_de_palabra(palabra: str) -> int:
    return 3 + zlib.crc32(palabra.lower().encode()) % 100_000


def _ids(texto: str) -> list[int]:
    return [id_de_palabra(p) for p in _PALABRA.findall(texto)]


class TokenizadorFalso:
    """Registra cada texto recibido (con su prefijo) para que el test vea lo que llega al modelo."""

    def __init__(self, error: Exception | None = None) -> None:
        self.error = error
        self.llamadas: list[tuple[str, str | None]] = []

    def codificar(self, texto: str, par: str | None = None) -> list[int]:
        if self.error is not None:
            raise self.error
        self.llamadas.append((texto, par))
        if par is None:
            return [ID_CLS, *_ids(texto), ID_SEP]
        return [ID_CLS, *_ids(texto), ID_SEP, ID_SEP, *_ids(par), ID_SEP]


class SesionDeEmbeddingsFalsa:
    """Estados ocultos ``[lote, tokens, dimension]``: el token 0 lleva la bolsa de palabras de la secuencia."""

    def __init__(self, dimension: int, error: Exception | None = None) -> None:
        self.dimension = dimension
        self.error = error
        self.lotes: list[list[list[int]]] = []

    def ejecutar(self, secuencias: Sequence[Sequence[int]]) -> np.ndarray:
        if self.error is not None:
            raise self.error
        self.lotes.append([list(s) for s in secuencias])
        largo = max(len(s) for s in secuencias)
        salida = np.zeros((len(secuencias), largo, self.dimension), dtype=np.float32)
        for fila, secuencia in enumerate(secuencias):
            for token in secuencia[1:-1]:
                salida[fila, 0, token % self.dimension] += 1.0
        return salida


class SesionDeLogitsFalsa:
    """Un logit por par: ``2 * palabras compartidas entre pregunta y pasaje - 4`` (o los logits fijos recibidos)."""

    def __init__(
        self,
        logits: Sequence[float] | None = None,
        error: Exception | None = None,
        constante: float | None = None,
    ) -> None:
        self.logits = list(logits) if logits is not None else None
        self.error = error
        self.constante = constante
        self.lotes: list[list[list[int]]] = []

    def ejecutar(self, secuencias: Sequence[Sequence[int]]) -> np.ndarray:
        if self.error is not None:
            raise self.error
        self.lotes.append([list(s) for s in secuencias])
        if self.constante is not None:
            return np.full((len(secuencias), 1), self.constante, dtype=np.float32)
        if self.logits is not None:
            inicio = sum(len(lote) for lote in self.lotes[:-1])
            return np.array(
                [[v] for v in self.logits[inicio : inicio + len(secuencias)]], dtype=np.float32
            )
        return np.array([[self._logit(list(s))] for s in secuencias], dtype=np.float32)

    @staticmethod
    def _logit(secuencia: list[int]) -> float:
        corte = secuencia.index(ID_SEP)
        pregunta, pasaje = set(secuencia[1:corte]), set(secuencia[corte + 2 : -1])
        return 2.0 * len(pregunta & pasaje) - 4.0


def coseno(a: Sequence[float], b: Sequence[float]) -> float:
    va, vb = np.asarray(a, dtype=np.float64), np.asarray(b, dtype=np.float64)
    return float(va @ vb / (np.linalg.norm(va) * np.linalg.norm(vb)))


__all__ = [
    "CH_C_1",
    "CH_M1_1",
    "CH_P1_1",
    "PASAJES_FX06AC",
    "Q_HER2",
    "SesionDeEmbeddingsFalsa",
    "SesionDeLogitsFalsa",
    "TokenizadorFalso",
    "coseno",
]
