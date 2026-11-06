"""Datos de un turno del chat que viajan entre los nodos del grafo (US-259): puros, sin E/S."""

from __future__ import annotations

from dataclasses import dataclass

BLOQUE_DOCUMENTADO = "documentado"
BLOQUE_LIMITACION = "limitacion"


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
class BloqueDelTurno:
    tipo: str
    texto: str
    fact_refs: tuple[str, ...] = ()
