"""División determinista de una justificación en afirmaciones (RN-01): regla pura, sin E/S.

Segmenta por oraciones (``.``, ``;``, ``?``, ``!`` seguidos de espacio o fin de texto), sin partir decimales ni las
abreviaturas de una lista fija. Nunca usa al LLM para dividir: no sería determinista y le daría la última palabra
sobre qué se verifica.
"""

from __future__ import annotations

import re

TERMINADORES = ".;?!"
ABREVIATURAS = frozenset(
    {
        "p.",
        "ej.",
        "e.g.",
        "i.e.",
        "vs.",
        "fig.",
        "dr.",
        "dra.",
        "aprox.",
        "etc.",
        "al.",
        "cf.",
        "no.",
    }
)
_FIN_DE_AFIRMACION = re.compile(rf"(?<=[{re.escape(TERMINADORES)}])\s+")


def dividir_en_afirmaciones(texto: str) -> tuple[str, ...]:
    afirmaciones: list[str] = []
    pendiente = ""
    for fragmento in _FIN_DE_AFIRMACION.split(texto.strip()):
        pendiente = f"{pendiente} {fragmento}".strip()
        if _termina_en_abreviatura(pendiente):
            continue
        afirmaciones.append(pendiente)
        pendiente = ""
    if pendiente:
        afirmaciones.append(pendiente)
    return tuple(a for a in afirmaciones if a)


def _termina_en_abreviatura(fragmento: str) -> bool:
    palabras = fragmento.rsplit(maxsplit=1)
    return bool(palabras) and palabras[-1].lstrip("(\"'[").lower() in ABREVIATURAS
