"""Datos de un turno del chat que viajan entre los nodos del grafo (US-259): puros, sin E/S."""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum

from app.domain.chat.estado import Intencion, TurnoPrevio


class TipoDeBloque(StrEnum):
    """Los tipos de ``ChatBlock.kind`` que este change emite; el enum cerrado de 8 valores es del contrato."""

    documentado = "documentado"
    evidencia = "evidencia"
    limitacion = "limitacion"


@dataclass(frozen=True)
class HechoDelCaso:
    """Un hecho del caso ya verbalizado y desidentificado (``CaseFact``): fechas relativas, nunca absolutas (RN-11)."""

    ref: str
    verbalizacion: str
    dia_relativo: int | None
    estado_de_revision: str
    conflicto_con: str | None = None


@dataclass(frozen=True)
class PropuestaDelTurno:
    """Una afirmación que propone el LLM, aún sin validar: el texto y lo que dice que la sustenta."""

    texto: str
    fact_refs: tuple[str, ...] = ()
    citas: tuple[str, ...] = ()


@dataclass(frozen=True)
class CitaDelBloque:
    """Una ``ChatCitation``: copiada del catálogo y del chunk recuperado en el turno, nunca del texto generado (RN-04)."""

    chunk_id: str
    document_id: str
    titulo_de_la_fuente: str
    ordinal: int
    cantidad: int
    texto_del_chunk: str


@dataclass(frozen=True)
class BloqueDelTurno:
    tipo: TipoDeBloque
    texto: str
    fact_refs: tuple[str, ...] = ()
    citas: tuple[CitaDelBloque, ...] = ()


def turno_previo_de(
    pregunta: str, intencion: Intencion, bloques: tuple[BloqueDelTurno, ...]
) -> TurnoPrevio:
    """El turno tal como Backend 1 lo guarda y reenvía al rehidratar: textos de los bloques y la unión ordenada de sus
    ``factRef`` (sin repetidos). Una sola regla para el hilo vivo y el reconstruido (AC-5)."""
    fact_refs: list[str] = []
    for bloque in bloques:
        fact_refs += [r for r in bloque.fact_refs if r not in fact_refs]
    return TurnoPrevio(
        pregunta=pregunta,
        intencion=intencion.value,
        textos_de_bloques=tuple(b.texto for b in bloques),
        fact_refs=tuple(fact_refs),
    )
