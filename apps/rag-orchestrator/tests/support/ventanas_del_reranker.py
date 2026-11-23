"""Arnés de las ventanas del reranker (US-278): chunks largos sintéticos y una sesión de logits por marcas.

Los chunks miden más que ``MAX_LENGTH`` con el tokenizador falso (una palabra = un token), así que ``maximo`` necesita
varias ventanas. La sesión puntúa por las palabras marca que aparecen en el pasaje de cada secuencia: el resultado
depende del contenido y no del orden en que el adapter agrupa el lote. Solo texto sintético (RN-13, RN-14).
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence

import numpy as np

from app.domain.modelos import describir_modelo
from app.domain.ventanas_del_reranker import ModoDeVentanas
from app.infrastructure.reranker.bge_reranker import BgeReranker
from tests.support.inferencia_falsa import ID_SEP, TokenizadorFalso, id_de_palabra
from tests.support.recuperacion import (
    BuscadorFalso,
    ChunkFx,
    EntornoDeRecuperacion,
    _vector,
    crear_entorno,
)

MAX_LENGTH = 32
SOLAPE = 3
VERSION = describir_modelo("BAAI/bge-reranker-v2-m3", "rev-ventanas-test", "c" * 64)
LOGIT_BAJO = -4.0

# Q_HER2 tiene 15 palabras: con los 4 especiales del par la capacidad por ventana es 32 - 4 - 15 = 13 tokens.
EVIDENCIA = "evidencia para cáncer de mama HER2 positivo estadio IIA"


def relleno(prefijo: str, cantidad: int) -> str:
    """Palabras distintas que no comparten nada con la pregunta."""
    return " ".join(f"{prefijo}{i}" for i in range(cantidad))


def chunk_largo(chunk_id: str, documento: str, texto: str, similitud: float = 1.0) -> ChunkFx:
    return ChunkFx(chunk_id, documento, texto, _vector(e0=similitud), True, "mama")


class SesionPorMarcas:
    """``SesionDeInferencia`` de logits: el máximo de las marcas presentes en el pasaje, o ``LOGIT_BAJO``."""

    def __init__(self, marcas: Mapping[str, float] | None = None) -> None:
        self._marcas = {id_de_palabra(palabra): logit for palabra, logit in (marcas or {}).items()}
        self.lotes: list[list[list[int]]] = []

    @property
    def secuencias(self) -> list[list[int]]:
        return [secuencia for lote in self.lotes for secuencia in lote]

    def ejecutar(self, secuencias: Sequence[Sequence[int]]) -> np.ndarray:
        self.lotes.append([list(s) for s in secuencias])
        return np.array([[self._logit(list(s))] for s in secuencias], dtype=np.float32)

    def _logit(self, secuencia: list[int]) -> float:
        pasaje = secuencia[secuencia.index(ID_SEP) + 2 : -1]
        return max((self._marcas[i] for i in pasaje if i in self._marcas), default=LOGIT_BAJO)


def reranker_de_ventanas(
    sesion: object,
    modo: ModoDeVentanas | None = None,
    *,
    max_tokens_por_lote: int = 4096,
    tokenizador: TokenizadorFalso | None = None,
) -> BgeReranker:
    """``BgeReranker`` real sobre dobles de inferencia; sin ``modo`` usa el del defecto de la configuración."""
    cambios = {} if modo is None else {"modo_de_ventanas": modo, "solape": SOLAPE}
    return BgeReranker(
        sesion,  # type: ignore[arg-type]
        tokenizador or TokenizadorFalso(),
        version=VERSION,
        max_length=MAX_LENGTH,
        max_pairs=12,
        max_tokens_por_lote=max_tokens_por_lote,
        **cambios,  # type: ignore[arg-type]
    )


def entorno_con(chunks: Sequence[ChunkFx], reranker: BgeReranker) -> EntornoDeRecuperacion:
    return crear_entorno(buscador=BuscadorFalso(chunks), reranker=reranker)  # type: ignore[arg-type]
