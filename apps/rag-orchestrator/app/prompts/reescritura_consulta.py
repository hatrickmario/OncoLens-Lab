"""Prompt `reescritura-consulta@0.1.0` del segundo loop de reescritura (US-238): función pura, sin E/S.

El prompt lleva exactamente la pregunta recibida (ya enmascarada por clinical-api, RN-11): sin contexto clínico, sin
``pseudoPatientId`` ni memoria de análisis (RN-24). Pide solo términos de expansión; el sistema se queda únicamente con los
que el catálogo versionado conoce (RN-27). Sin lenguaje prescriptivo (RN-23). Cambiarlo exige la suite `evaluate` (OL-06).
"""

from __future__ import annotations

from typing import Any, Final

VERSION_DEL_PROMPT_DE_REESCRITURA: Final = "reescritura-consulta@0.1.0"

PLANTILLA_DE_REESCRITURA: Final = """\
Eres un asistente que ayuda a buscar en un corpus público de literatura oncológica.
La búsqueda con la pregunta de abajo no encontró fragmentos relevantes, quizá por errores de ortografía, siglas o nombres poco habituales.

Instrucciones:
- Propón hasta {maximo_de_terminos} términos de expansión: nombres de fármacos, biomarcadores, entidades clínicas o siglas desarrolladas, escritos con su ortografía correcta, que ayuden a encontrar la evidencia que la pregunta busca.
- Cada término es una palabra o una expresión corta, sin oraciones.
- No respondas la pregunta ni describas tratamientos.

Pregunta:
{pregunta}

Devuelve únicamente un JSON con la forma {{"terminos": ["...", "..."]}}.
"""


def esquema_de_reescritura(maximo_de_terminos: int) -> dict[str, Any]:
    """Esquema cerrado de la salida; ``maxItems`` es la clave de configuración, nunca un literal."""
    return {
        "type": "object",
        "properties": {
            "terminos": {
                "type": "array",
                "items": {"type": "string", "minLength": 1, "maxLength": 80},
                "maxItems": maximo_de_terminos,
            }
        },
        "required": ["terminos"],
        "additionalProperties": False,
    }


def construir_prompt_de_reescritura(pregunta: str, maximo_de_terminos: int) -> str:
    """La plantilla con la pregunta tal como llegó, sin ningún otro dato de la petición."""
    return PLANTILLA_DE_REESCRITURA.format(pregunta=pregunta, maximo_de_terminos=maximo_de_terminos)
