"""Modelos falsos diminutos que cumplen los puertos de ``app.evaluation.envoltorios`` (LSP: mismas firmas y errores)."""

from __future__ import annotations

import re
import zlib
from pathlib import Path

import numpy as np
from app.evaluation.config_medicion import ModeloSpec

DIM = 64


class TokenizadorPalabras:
    """Un token por palabra."""

    def __init__(self, max_length: int = 512, tokens_especiales: int = 2) -> None:
        self.max_length = max_length
        self.tokens_especiales = tokens_especiales

    def desplazamientos(self, texto: str) -> list[tuple[int, int]]:
        return [(m.start(), m.end()) for m in re.finditer(r"\S+", texto)]


def _palabras(texto: str) -> list[str]:
    return re.findall(r"\w+", texto.lower())


class EmbedderFalso:
    """Bolsa de palabras con hash estable, normalizada: determinista y sin cargar nada."""

    def codificar(self, textos: list[str], *, consulta: bool) -> np.ndarray:
        matriz = np.zeros((len(textos), DIM), dtype=np.float32)
        for i, texto in enumerate(textos):
            for palabra in _palabras(texto):
                matriz[i, zlib.crc32(palabra.encode()) % DIM] += 1.0
        normas = np.linalg.norm(matriz, axis=1, keepdims=True)
        return matriz / np.maximum(normas, 1e-12)


class RerankerFalso:
    def puntuar(self, consulta: str, pasajes: list[str]) -> list[float]:
        palabras = set(_palabras(consulta))
        return [float(len(palabras & set(_palabras(p)))) - 1.0 for p in pasajes]


class NliFalso:
    def clasificar(self, pares: list[tuple[str, str]]) -> list[str]:
        return ["neutral" for _ in pares]


class FabricaFalsa:
    def embedder(self, spec: ModeloSpec, directorio: Path, cuantizacion: str, hilos: int) -> EmbedderFalso:
        return EmbedderFalso()

    def tokenizador(self, spec: ModeloSpec, directorio: Path) -> TokenizadorPalabras:
        return TokenizadorPalabras()

    def reranker(self, spec: ModeloSpec, directorio: Path, cuantizacion: str, hilos: int, max_length: int) -> RerankerFalso:
        return RerankerFalso()

    def nli(self, spec: ModeloSpec, directorio: Path, cuantizacion: str, hilos: int) -> NliFalso:
        return NliFalso()


def exportador_falso(spec: ModeloSpec, destino: Path) -> None:
    import json

    destino.mkdir(parents=True, exist_ok=True)
    (destino / "export.json").write_text(json.dumps({"tamano_bytes": {"int8": 1_000, "fp32": 4_000}}), encoding="utf-8")
