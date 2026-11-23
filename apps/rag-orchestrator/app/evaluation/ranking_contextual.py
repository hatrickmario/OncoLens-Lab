"""Observador del ranking final de la familia `contextual` (US-273 AC-2): decora el puerto ``Reranker`` y anota los tres primeros
chunks (id y ``relevance_score``) de la última puntuación de cada consulta, sin cambiar su comportamiento.

La respuesta de ``/rag/query`` no trae los chunks por debajo del umbral ni el puntaje de cada uno, y añadírselos cambiaría el
contrato; por eso se observa el mismo puerto sobre el que decide el servicio (como la familia `diagnostico`). Lo anotado vive
solo en memoria como ids y puntajes: nunca el texto de un chunk ni de una pregunta (RN-14). Cumple el contrato del puerto
(LSP): misma firma, misma ``version``, el puntaje ya viene en [0, 1] y los errores del reranker interno se propagan.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

from app.application.ports import CandidatoParaReranker, Reranker
from app.evaluation.metricas.contextual import ChunkPuntuado

CHUNKS_POR_PREGUNTA = 3


@dataclass
class RegistroDelRanking:
    """Lo que puntuó el *reranker* en la consulta en curso; ``reiniciar()`` lo vacía antes de la siguiente."""

    ultimo: tuple[ChunkPuntuado, ...] = ()
    """Los tres primeros de la última puntuación (el último loop de la pregunta); vacío si no hubo candidatos."""

    def reiniciar(self) -> None:
        self.ultimo = ()


class RerankerQueRegistra:
    def __init__(self, interno: Reranker, registro: RegistroDelRanking) -> None:
        self._interno, self._registro = interno, registro

    @property
    def version(self) -> str:
        return self._interno.version

    def puntuar(self, pregunta: str, candidatos: Sequence[CandidatoParaReranker]) -> list[float]:
        puntajes = self._interno.puntuar(pregunta, candidatos)
        # La misma regla que el servicio: orden estable por puntaje descendente (en empate, el orden denso).
        ranking = sorted(zip(candidatos, puntajes, strict=True), key=lambda par: -par[1])
        self._registro.ultimo = tuple(
            ChunkPuntuado(c.chunk_id, p) for c, p in ranking[:CHUNKS_POR_PREGUNTA]
        )
        return puntajes
