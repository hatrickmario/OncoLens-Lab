"""``FakeChatLlmEvidencia``: el LLM local falso del chat para el seguimiento de un análisis (US-265 / L1D-322).

Es un ``FakeChatLlm`` (mismo contrato del puerto ``LlmClient``: texto crudo o ``FalloDelLlm``, sin reintento, cuenta por
separado clasificación y generación) con los guiones del seguimiento: JSON CRUDO ``{"claims": [{"text", "citations"}]}``
donde ``C1`` es el alias del chunk más relevante del turno (``ch-m1-1`` con los puntajes del arnés). Solo datos sintéticos.
"""

from __future__ import annotations

import json
from typing import Any

from tests.support.generador_falso import RAZON_ANTI_HER2
from tests.support.llm_chat_falso import FakeChatLlm

TEXTO_DEL_SEGUIMIENTO = (
    "El estudio describe terapia endocrina adyuvante en tumores con receptor de estrógeno positivo."
)
TEXTO_SIN_SOPORTE_NLI = "El estudio describe una reducción de la mortalidad a la mitad."
TEXTO_SOLO_EN_LA_MEMORIA = RAZON_ANTI_HER2
"""La razón de la opción del turno anterior (``LLM-OK``): solo la respuesta previa la sostiene."""
TEXTO_PRESCRIPTIVO = "El paciente debe recibir terapia endocrina adyuvante."


def _afirmacion(texto: str, *alias: str) -> dict[str, Any]:
    return {"text": texto, "citations": list(alias)}


def _salida(*afirmaciones: dict[str, Any]) -> str:
    return json.dumps({"claims": list(afirmaciones)}, ensure_ascii=False)


_RUTA_SEGUIMIENTO = json.dumps({"intent": "seguimiento_evidencia"})

ESCENARIOS: dict[str, dict[str, str]] = {
    "SEG-OK": {
        "ruta": _RUTA_SEGUIMIENTO,
        "generacion": _salida(_afirmacion(TEXTO_DEL_SEGUIMIENTO, "C1")),
    },
    "CHAT-MEMORIA": {
        "ruta": _RUTA_SEGUIMIENTO,
        "generacion": _salida(
            _afirmacion(TEXTO_DEL_SEGUIMIENTO, "C1"), _afirmacion(TEXTO_SOLO_EN_LA_MEMORIA)
        ),
    },
    "SEG-NLI-NEUTRAL": {
        "ruta": _RUTA_SEGUIMIENTO,
        "generacion": _salida(
            _afirmacion(TEXTO_DEL_SEGUIMIENTO, "C1"), _afirmacion(TEXTO_SIN_SOPORTE_NLI, "C1")
        ),
    },
    "SEG-PRESCRIPTIVO": {
        "ruta": _RUTA_SEGUIMIENTO,
        "generacion": _salida(
            _afirmacion(TEXTO_DEL_SEGUIMIENTO, "C1"), _afirmacion(TEXTO_PRESCRIPTIVO, "C1")
        ),
    },
    "SEG-SALIDA-INVALIDA": {"ruta": _RUTA_SEGUIMIENTO, "generacion": '{"claims": ['},
}

__all__ = ["ESCENARIOS", "FakeChatLlmEvidencia"]


class FakeChatLlmEvidencia(FakeChatLlm):
    def __init__(self, escenario: str = "SEG-OK", error: Exception | None = None) -> None:
        super().__init__("CHAT-OK", error)
        self._guion = ESCENARIOS[escenario]
