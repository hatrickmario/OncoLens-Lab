"""Reglas puras de la familia `contextual` (US-271 AC-9, L1D-329): sin E/S, probadas con datos de dominio.

La causa de una pregunta de sinónimos que no supera el umbral y los recuentos por clase. Solo ids, estados y recuentos:
nunca el texto de una pregunta, de un chunk ni de un término del caso (RN-14).
"""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from typing import Final

from app.domain.lenguaje import normalizar_texto

ESTADO_CON_EVIDENCIA: Final = "con_evidencia"
ESTADO_SIN_EVIDENCIA: Final = "sin_evidencia"
ESTADO_SALIDA_INVALIDA: Final = "salida_invalida"
ESTADOS_DE_FILA: Final = (ESTADO_CON_EVIDENCIA, ESTADO_SIN_EVIDENCIA, ESTADO_SALIDA_INVALIDA)
CAUSA_TERMINO_AUSENTE: Final = "termino_ausente_del_corpus"
CAUSA_BAJO_UMBRAL: Final = "bajo_umbral_con_termino_en_corpus"
CAUSAS_DE_SINONIMO: Final = (CAUSA_TERMINO_AUSENTE, CAUSA_BAJO_UMBRAL)
CLASES_DE_PREGUNTA: Final = ("generica", "con_tema", "control")
SEGUNDO_LOOP_CONTEXTUAL: Final = "contextual"
SEGUNDO_LOOP_NINGUNO: Final = "ninguno"
AMBITO_TOTAL: Final = "total"

CONDICIONES_DE_LA_CAUSA: Final = (
    "algún chunk supera RELEVANCE_THRESHOLD",
    "ninguna forma del término (canónica o sinónimo, es o en, sin distinguir mayúsculas ni tildes) aparece en un chunk del corpus de la corrida recuperable para el tipo de cáncer del caso",
    "alguna forma del término aparece en un chunk del corpus y ningún chunk supera RELEVANCE_THRESHOLD",
)
REGLA_DE_LA_CAUSA: Final = tuple(
    zip(
        range(1, 4),
        CONDICIONES_DE_LA_CAUSA,
        (None, CAUSA_TERMINO_AUSENTE, CAUSA_BAJO_UMBRAL),
        strict=True,
    )
)
"""La regla de ``causa_de_sinonimo`` tal como la escribe el informe: (orden, condición, causa); la primera que se cumple manda."""


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
    """Por qué una pregunta de sinónimos no supera el umbral (design D4): ``None`` si lo supera; ``termino_ausente_del_corpus``
    si ninguna forma del término (canónica o sinónimo, en cualquier idioma) aparece en un chunk recuperable para el caso
    (quien llama pasa solo los chunks del tipo de cáncer del caso: la recuperación filtra por él);
    ``bajo_umbral_con_termino_en_corpus`` si alguna aparece y aun así no supera el umbral (el detalle por etapa es de
    ``diagnostico``). La comparación no distingue mayúsculas, tildes ni signos y exige palabras completas."""
    if supero_umbral:
        return None
    if _alguna_forma_aparece(formas, textos_de_chunks):
        return CAUSA_BAJO_UMBRAL
    return CAUSA_TERMINO_AUSENTE


def _alguna_forma_aparece(formas: Sequence[str], textos_de_chunks: Iterable[str]) -> bool:
    normalizadas = [f" {forma} " for forma in map(normalizar_texto, formas) if forma]
    return any(
        forma in f" {normalizar_texto(texto)} "
        for texto in textos_de_chunks
        for forma in normalizadas
    )


def recuentos_por_clase(filas: Sequence[FilaContextual]) -> tuple[RecuentoDeClase, ...]:
    """Por ámbito (el total y luego cada caso, en el orden en que aparecen) y por clase: cuántas preguntas terminaron
    ``con_evidencia`` y cuántas se corrieron. Una clase sin preguntas lleva ``total`` 0: no se omite (AC-2, AC-4)."""
    casos = list(dict.fromkeys(f.caso for f in filas))
    return tuple(
        _recuento(ambito, clase, [f for f in filas if ambito == AMBITO_TOTAL or f.caso == ambito])
        for ambito in (AMBITO_TOTAL, *casos)
        for clase in CLASES_DE_PREGUNTA
    )


def _recuento(ambito: str, clase: str, filas: Sequence[FilaContextual]) -> RecuentoDeClase:
    de_la_clase = [f for f in filas if f.clase == clase]
    con_evidencia = sum(f.estado == ESTADO_CON_EVIDENCIA for f in de_la_clase)
    return RecuentoDeClase(ambito, clase, con_evidencia, len(de_la_clase))
