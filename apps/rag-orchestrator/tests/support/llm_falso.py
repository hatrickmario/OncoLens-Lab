"""FX-06a-b: ``FakeLlmClient``, el LLM local falso que devuelve JSON CRUDO (texto) por escenario.

Lo consume el ``LlmEvidenceGenerator`` REAL: así el parseo, la validación del esquema y la descarga de los metadatos
inventados se prueban en la ruta de producción. Cumple el contrato del puerto ``LlmClient`` (texto o ``FalloDelLlm``)
y cuenta cada invocación.
"""

from __future__ import annotations

import json
from collections.abc import Mapping
from typing import Any

from tests.support.afirmaciones_atomicas import ESCENARIOS_ATOMICOS
from tests.support.generador_falso import OPCION_ANTI_HER2, RAZON_ANTI_HER2, TITULO_INVENTADO

OPCION_SOLA = "Terapia anti-HER2 sola"
RAZON_SOLA = "La evidencia recuperada describe el uso de terapia anti-HER2 sin quimioterapia."


DETALLE_UNO = "El estudio describe la duración de la terapia dirigida contra HER2."
DETALLE_DOS = "El beneficio se reporta en la supervivencia libre de enfermedad."
DETALLE_TRES = "El seguimiento descrito supera los cinco años."


def _afirmacion(texto: str, papel: str, *chunk_ids: str) -> dict[str, Any]:
    return {"text": texto, "role": papel, "citations": list(chunk_ids)}


def _opcion(opcion: str, razon: str, *chunk_ids: str, **extra: Any) -> dict[str, Any]:
    """Una opción con su justificación como única afirmación ``principal`` (esquema ``claims[]`` de US-245)."""
    return {"option": opcion, "claims": [_afirmacion(razon, "principal", *chunk_ids)], **extra}


def _opcion_con_secundarias(*secundarias: str) -> dict[str, Any]:
    """La opción de ``LLM-OK`` más una afirmación ``secundaria`` por texto, todas citando ``C1``."""
    base = _opcion(OPCION_ANTI_HER2, RAZON_ANTI_HER2, "C1")
    return {
        **base,
        "claims": [*base["claims"], *(_afirmacion(t, "secundaria", "C1") for t in secundarias)],
    }


def _salida(*opciones: dict[str, Any]) -> str:
    return json.dumps({"options": list(opciones)}, ensure_ascii=False)


# Los escenarios citan por ALIAS (US-236), que depende del orden por ``relevance_score`` del fixture de recuperación:
# con el corpus FX-06a-a (Q-HER2) C1 = ``ch-m1-1`` (0.87) y C2 = ``ch-inj-1`` (0.40); con FX-06a-c
# (``recuperacion_alias.py``) C1 = ``ch-m2-1``, C2 = ``ch-m1-1``, C3 = ``ch-m3-1`` y C4 = ``ch-m3-2``.
ESCENARIOS_LLM: dict[str, str] = {
    "LLM-OK": _salida(_opcion(OPCION_ANTI_HER2, RAZON_ANTI_HER2, "C1")),
    "LLM-CON-DETALLE": _salida(_opcion_con_secundarias(DETALLE_UNO, DETALLE_DOS)),
    "LLM-CON-TRES-DETALLES": _salida(
        _opcion_con_secundarias(DETALLE_UNO, DETALLE_DOS, DETALLE_TRES)
    ),
    "LLM-DETALLE-CON-ARTEFACTO": _salida(
        _opcion_con_secundarias(DETALLE_UNO, "El ensayo NSABP-B-3隀 reportó el mismo beneficio.")
    ),
    "LLM-DOS": _salida(
        _opcion(OPCION_ANTI_HER2, RAZON_ANTI_HER2, "C1"),
        _opcion(OPCION_SOLA, RAZON_SOLA, "C2"),
    ),
    "LLM-SIN-OPCIONES": _salida(),
    "LLM-CITA-DOBLE": _salida(_opcion(OPCION_ANTI_HER2, RAZON_ANTI_HER2, "C2", "C1")),
    "LLM-TITULO-FALSO": _salida(
        _opcion(
            OPCION_ANTI_HER2,
            RAZON_ANTI_HER2,
            "C1",
            title=TITULO_INVENTADO,
            sourceName="NCCN",
        )
    ),
    # US-127 AC-2: el LLM añade a la opción un tamaño de muestra y una fase que no son los del catálogo (RN-25, RN-04).
    "LLM-METADATOS-FALSOS": _salida(
        _opcion(OPCION_ANTI_HER2, RAZON_ANTI_HER2, "C1", sampleSize=9999, trialPhase="IV")
    ),
    "LLM-FUERA-DE-ESQUEMA": json.dumps({"synthesis": {"agreements": [], "discrepancies": []}}),
    "LLM-JSON-ROTO": '{"options": [',
    # US-236 (alias efímeros por consulta): la opción cita por alias; ``ch-m1-1`` es el chunk real de C2 en FX-06a-c.
    "LLM-ALIAS-C2": _salida(_opcion(OPCION_ANTI_HER2, RAZON_ANTI_HER2, "C2")),
    "LLM-ALIAS-C1-C2": _salida(_opcion(OPCION_ANTI_HER2, RAZON_ANTI_HER2, "C1", "C2")),
    "LLM-ALIAS-INEXISTENTE": _salida(_opcion(OPCION_ANTI_HER2, RAZON_ANTI_HER2, "C9")),
    "LLM-ALIAS-C4": _salida(_opcion(OPCION_ANTI_HER2, RAZON_ANTI_HER2, "C4")),
    "LLM-ID-REAL": _salida(_opcion(OPCION_ANTI_HER2, RAZON_ANTI_HER2, "ch-m1-1")),
}

ESCENARIOS_LLM.update(ESCENARIOS_ATOMICOS)


class FakeLlmClient:
    """``LlmClient`` con respuesta cruda fija por escenario; registra los prompts recibidos."""

    def __init__(self, escenario: str = "LLM-OK", error: Exception | None = None) -> None:
        self._crudo = ESCENARIOS_LLM[escenario]
        self.error = error
        self.prompts: list[str] = []
        self.esquemas: list[Mapping[str, Any]] = []

    @property
    def invocaciones(self) -> int:
        return len(self.prompts)

    async def completar_json(self, prompt: str, esquema: Mapping[str, Any]) -> str:
        self.prompts.append(prompt)
        self.esquemas.append(esquema)
        if self.error is not None:
            raise self.error
        return self._crudo
