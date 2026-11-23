"""Reglas puras de la familia `contextual` (US-271 AC-9, L1D-329): sin E/S, probadas con datos de dominio.

La causa de una pregunta de sinónimos que no supera el umbral y los recuentos por clase. Solo ids, estados y recuentos:
nunca el texto de una pregunta, de un chunk ni de un término del caso (RN-14).
"""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from typing import Final

CAUSA_TERMINO_AUSENTE: Final = "termino_ausente_del_corpus"
CAUSA_BAJO_UMBRAL: Final = "bajo_umbral_con_termino_en_corpus"
CAUSAS_DE_SINONIMO: Final = (CAUSA_TERMINO_AUSENTE, CAUSA_BAJO_UMBRAL)
CLASES_DE_PREGUNTA: Final = ("generica", "con_tema", "control")
SEGUNDO_LOOP_CONTEXTUAL: Final = "contextual"
SEGUNDO_LOOP_NINGUNO: Final = "ninguno"
AMBITO_TOTAL: Final = "total"


@dataclass(frozen=True)
class FilaContextual:
    """Una pregunta corrida con un caso. ``None`` = no observado (≠ ``0.0``)."""

    pregunta_id: str
    clase: str
    caso: str
    estado: str
    supero_umbral: bool
    top_relevance_score: float | None
    segundo_loop: str | None


@dataclass(frozen=True)
class RecuentoDeClase:
    ambito: str
    """``total`` o el id del caso."""
    clase: str
    con_evidencia: int
    total: int


def causa_de_sinonimo(
    supero_umbral: bool, formas: Sequence[str], textos_de_chunks: Iterable[str]
) -> str | None:
    raise NotImplementedError("no implementado")


def recuentos_por_clase(filas: Sequence[FilaContextual]) -> tuple[RecuentoDeClase, ...]:
    raise NotImplementedError("no implementado")
