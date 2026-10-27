"""Soportes de test de la ingesta en lote (US-117a): fixture FX-06c-b, codificador *sparse* falso y embedder interrumpible.

Los fakes cumplen el contrato de los puertos reales (LSP): ``CodificadorSparseFalso`` devuelve un mapa por texto, en el
mismo orden y nunca vacío; ``EmbedderInterrumpible`` solo añade la interrupción "a la fuerza" (``KeyboardInterrupt``,
que NO es una ``Exception``) en la invocación pedida.
"""

from __future__ import annotations

import hashlib
import re
from collections.abc import Sequence

from app.domain.corpus_seed.chunking import fragmentar, normalizar_texto
from app.domain.corpus_seed.documento import DocumentoDeSemilla
from app.infrastructure.fetch.fuente_de_texto import FuenteDeTextoDelManifiesto
from app.infrastructure.seed_manifest.lector import leer_manifiesto
from app.infrastructure.tokenizer.por_palabras import TokenizadorPorPalabras
from tests.support.semilla import (
    DIRECTORIO_DE_FIXTURES,
    SOLAPE_DE_CHUNK_DE_TEST,
    TAMANO_DE_CHUNK_DE_TEST,
    EmbedderFalso,
)

MANIFIESTO_FX_06C_B = DIRECTORIO_DE_FIXTURES / "ingest-manifest.yaml"
MANIFIESTO_FX_06C_B_V2 = DIRECTORIO_DE_FIXTURES / "ingest-manifest-v2.yaml"
MANIFIESTO_FX_06C_B_CON_FALLO = DIRECTORIO_DE_FIXTURES / "ingest-manifest-falla.yaml"
DOCUMENTOS_ADMISIBLES_FX_06C_B = ("i-ct-1", "i-lit-1", "i-lit-2", "i-gl-1")
VOCABULARIO_SPARSE_DE_TEST = 1000
_PALABRA = re.compile(r"\w+")


def documentos_fx_06c_b(*claves: str) -> tuple[DocumentoDeSemilla, ...]:
    todos = {d.document_key: d for d in leer_manifiesto(MANIFIESTO_FX_06C_B)}
    return tuple(todos[c] for c in claves) if claves else tuple(todos.values())


# Filas de ``corpus_document`` tras ingerir FX-06c-b completo: 4 embebidos y 2 rechazados por licencia o fuente.
FILAS_DEL_CATALOGO_FX_06C_B = 6


def fragmentos_esperados_fx_06c_b(*claves: str) -> dict[str, list[str]]:
    """Los fragmentos que la ingesta debe producir por documento admisible, calculados con las reglas puras de chunking
    (no con una segunda ingesta): sirve de referencia tanto en memoria como contra PostgreSQL y Milvus reales."""
    fuente = FuenteDeTextoDelManifiesto(DIRECTORIO_DE_FIXTURES, None)
    pedidas = claves or DOCUMENTOS_ADMISIBLES_FX_06C_B
    return {
        d.document_key: fragmentar(
            normalizar_texto(fuente.obtener_texto(d)),
            TokenizadorPorPalabras(),
            tamano=TAMANO_DE_CHUNK_DE_TEST,
            solape=SOLAPE_DE_CHUNK_DE_TEST,
        )
        for d in documentos_fx_06c_b(*pedidas)
    }


def fragmentos_de_i_gl_1_v2() -> list[str]:
    """Los fragmentos de ``i-gl-1-v2`` (FX-06c-b) con las reglas puras de chunking."""
    (documento,) = leer_manifiesto(MANIFIESTO_FX_06C_B_V2)
    return fragmentar(
        normalizar_texto(
            FuenteDeTextoDelManifiesto(DIRECTORIO_DE_FIXTURES, None).obtener_texto(documento)
        ),
        TokenizadorPorPalabras(),
        tamano=TAMANO_DE_CHUNK_DE_TEST,
        solape=SOLAPE_DE_CHUNK_DE_TEST,
    )


def chunks_esperados_fx_06c_b() -> dict[str, int]:
    return {k: len(v) for k, v in fragmentos_esperados_fx_06c_b().items()}


def textos_esperados_fx_06c_b(*claves: str) -> set[str]:
    return {t for fragmentos in fragmentos_esperados_fx_06c_b(*claves).values() for t in fragmentos}


class CodificadorSparseFalso:
    """``SparsePassageEncoder`` determinista: cada palabra es un término cuyo id y peso salen de su SHA-256.

    Un texto sin palabras da un único término ``0`` (nunca el mapa vacío, como el adapter real). Cuenta las invocaciones.
    """

    def __init__(self) -> None:
        self.invocaciones = 0
        self.textos_codificados = 0
        self.error: Exception | None = None
        # Rompe el contrato a propósito (mapas vacíos) para probar que la ingesta no inserta un pasaje sin sparse.
        self.devolver_vacios = False

    def codificar(self, textos: Sequence[str]) -> list[dict[int, float]]:
        self.invocaciones += 1
        if self.error is not None:
            raise self.error
        self.textos_codificados += len(textos)
        return [{} if self.devolver_vacios else self._terminos(t) for t in textos]

    @staticmethod
    def _terminos(texto: str) -> dict[int, float]:
        terminos: dict[int, float] = {}
        for palabra in _PALABRA.findall(texto.lower()):
            resumen = hashlib.sha256(palabra.encode("utf-8")).digest()
            identificador = int.from_bytes(resumen[:4], "big") % VOCABULARIO_SPARSE_DE_TEST
            terminos[identificador] = max(terminos.get(identificador, 0.0), 0.1 + resumen[4] / 255)
        return terminos or {0: 1.0}


class EmbedderInterrumpible(EmbedderFalso):
    """``EmbedderFalso`` que lanza ``KeyboardInterrupt`` en la invocación ``interrumpir_en`` (1 = la primera)."""

    def __init__(self, interrumpir_en: int | None = None) -> None:
        super().__init__()
        self.interrumpir_en = interrumpir_en
        self.textos_recibidos: list[str] = []

    def embeber(self, textos: Sequence[str]) -> list[list[float]]:
        if self.interrumpir_en is not None and self.invocaciones + 1 == self.interrumpir_en:
            self.invocaciones += 1
            raise KeyboardInterrupt
        self.textos_recibidos.extend(textos)
        return super().embeber(textos)
