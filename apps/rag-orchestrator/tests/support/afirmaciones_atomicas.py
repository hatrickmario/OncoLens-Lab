"""FX-T1a-b (US-245): salidas CRUDAS del LLM falso con afirmaciones atómicas por papel.

Extiende FX-06a-b: el ``LlmEvidenceGenerator`` REAL parsea estas salidas, así que el esquema interno ``claims[]`` se
prueba por la ruta de producción. Los textos son declarativos, de a lo sumo 20 palabras y sin vocabulario de RN-23,
salvo los escenarios que lo ejercitan a propósito (``PRESC``, ``MODAL``). Citan por alias: con el corpus FX-06a-a
(``Q-HER2``) ``C1`` es ``ch-m1-1``.
"""

from __future__ import annotations

import json
from typing import Any

from tests.support.generador_falso import OPCION_ANTI_HER2

PRINCIPAL = (
    "La terapia anti-HER2 adyuvante mejora la supervivencia libre de enfermedad "
    "en cáncer de mama temprano HER2 positivo."
)
SECUNDARIA = "El beneficio se observa en la población con tumores HER2 positivos."
SALVEDAD = "La evidencia describe únicamente cáncer de mama en estadio temprano."

SECUNDARIA_CON_ALIAS = "El fragmento C1 reporta que el beneficio se observa en la población con tumores HER2 positivos."
SECUNDARIA_MODAL = "La terapia debería continuarse durante un año."
PRINCIPAL_MODAL = (
    "La terapia anti-HER2 adyuvante debería continuarse durante un año en cáncer de mama."
)
SECUNDARIA_PRESCRIPTIVA = "La terapia es recomendado para este paciente con tumores HER2 positivos."
SENTINELA = "centinela-salida-llm-7731"


def afirmacion(texto: str, papel: str, *citas: str) -> dict[str, Any]:
    return {"text": texto, "role": papel, "citations": list(citas or ("C1",))}


def salida_con_afirmaciones(*afirmaciones: dict[str, Any]) -> str:
    opcion = {"option": OPCION_ANTI_HER2, "claims": list(afirmaciones)}
    return json.dumps({"options": [opcion]}, ensure_ascii=False)


def _completa(secundaria: str = SECUNDARIA, principal: str = PRINCIPAL) -> str:
    return salida_con_afirmaciones(
        afirmacion(principal, "principal"),
        afirmacion(secundaria, "secundaria"),
        afirmacion(SALVEDAD, "salvedad"),
    )


ESCENARIOS_ATOMICOS: dict[str, str] = {
    "LLM-ATOM-OK": _completa(),
    # Misma salida: lo que cambia es el veredicto del NLI falso sobre cada afirmación (AC-2, AC-3, AC-4).
    "LLM-ATOM-SEC": _completa(),
    "LLM-ATOM-PRIN": _completa(),
    "LLM-ATOM-SALV": _completa(),
    "LLM-ATOM-ALIAS": _completa(secundaria=SECUNDARIA_CON_ALIAS),
    "LLM-ATOM-LARGA": _completa(secundaria=" ".join(["palabra"] * 21)),
    "LLM-ATOM-MODAL": _completa(secundaria=SECUNDARIA_MODAL),
    "LLM-ATOM-MODAL-PRIN": _completa(principal=PRINCIPAL_MODAL),
    "LLM-ATOM-PRESC": _completa(secundaria=SECUNDARIA_PRESCRIPTIVA),
    # Texto centinela: el log y la respuesta de error no pueden contenerlo (RN-14, Q1).
    "LLM-ATOM-DOS-PRINCIPALES": salida_con_afirmaciones(
        afirmacion(f"{SENTINELA} uno", "principal"), afirmacion(f"{SENTINELA} dos", "principal")
    ),
    "LLM-ATOM-SIN-PRINCIPAL": salida_con_afirmaciones(afirmacion(SECUNDARIA, "secundaria")),
}
