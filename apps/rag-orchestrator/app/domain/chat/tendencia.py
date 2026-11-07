"""Política contra el lenguaje de tendencia y valoración en una interpretación del chat (US-261, RN-23): regla pura.

Una ``interpretacion`` enumera y relaciona valores; no dice si algo subió, empeoró o es favorable (eso es valoración clínica
que el prompt ya excluye: «sin interpretar la tendencia»). Si el LLM la escribe, la afirmación se omite y cuenta en
``omittedClaims``. La lista es cerrada y se compara sin tildes ni mayúsculas, por palabra completa.
"""

from __future__ import annotations

import re

from app.domain.lenguaje import sin_tildes

TERMINOS_DE_TENDENCIA = (
    "subio",
    "suba",
    "aumento",
    "incremento",
    "crecio",
    "disminuyo",
    "descendio",
    "redujo",
    "empeoro",
    "empeoramiento",
    "mejoro",
    "mejoria",
    "progreso",
    "progresion",
    "regresion",
    "favorable",
    "desfavorable",
)
"""Verbos y sustantivos de tendencia o valoración, sin tildes. «bajó» no está: sin tilde se confunde con la preposición
«bajo». Una interpretación omitida de más cuesta menos que dejar pasar una valoración."""
_PATRON = re.compile(r"\b(?:" + "|".join(TERMINOS_DE_TENDENCIA) + r")\b")


def tiene_verbo_de_tendencia(texto: str) -> bool:
    """``True`` si el texto usa algún término de ``TERMINOS_DE_TENDENCIA`` como palabra completa."""
    return _PATRON.search(sin_tildes(texto)) is not None
