"""Guiones del LLM falso para `/rag/follow-up` (US-218): JSON crudo con el marcador de salida y las afirmaciones.

Citan por alias (``C1`` = ``ch-m1-1`` con el reranker de ``tests/support/seguimiento.py``). Solo datos sintéticos.
"""

from __future__ import annotations

import json
from typing import Any

TEXTO_SEGUIMIENTO_OK = (
    "El estudio describe terapia endocrina adyuvante en tumores con receptor de estrógeno positivo."
)
# Copia literal de la síntesis de ``analysisMemory`` de ``rag-follow-up-request.json``: solo la memoria la sostiene.
TEXTO_SOLO_EN_LA_MEMORIA = "Las fuentes describen terapia anti-HER2 con quimioterapia adyuvante y terapia endocrina adyuvante."
TEXTO_PRESCRIPTIVO = "El paciente debe recibir terapia endocrina adyuvante."


def _afirmacion(texto: str, *alias: str) -> dict[str, Any]:
    return {"text": texto, "citations": list(alias)}


def _salida(resultado: str, *afirmaciones: dict[str, Any]) -> str:
    return json.dumps({"outcome": resultado, "claims": list(afirmaciones)}, ensure_ascii=False)


ESCENARIOS_SEGUIMIENTO: dict[str, str] = {
    "SEG-OK": _salida("respuesta", _afirmacion(TEXTO_SEGUIMIENTO_OK, "C1")),
    "SEG-SOLO-MEMORIA": _salida(
        "respuesta",
        _afirmacion(TEXTO_SEGUIMIENTO_OK, "C1"),
        _afirmacion(TEXTO_SOLO_EN_LA_MEMORIA, "C1"),
    ),
    "SEG-MEMORIA-SIN-CITA": _salida(
        "respuesta",
        _afirmacion(TEXTO_SEGUIMIENTO_OK, "C1"),
        _afirmacion(TEXTO_SOLO_EN_LA_MEMORIA),
    ),
    "SEG-PRESCRIPTIVO": _salida(
        "respuesta",
        _afirmacion(TEXTO_SEGUIMIENTO_OK, "C1"),
        _afirmacion(TEXTO_PRESCRIPTIVO, "C1"),
    ),
    "SEG-FUERA-DE-CONTEXTO": _salida("fuera_de_contexto"),
    "SEG-SALIDA-INVALIDA": '{"outcome": "respuesta", "claims": [',
}
