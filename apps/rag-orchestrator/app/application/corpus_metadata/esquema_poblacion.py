"""Esquema JSON, prompt y validación de la salida de la tarea corta de población (US-242, ADR-47, D4).

Esquema cerrado ``{"values": [{"value", "chunkId", "scope"}]}`` con ``maxItems`` = ``POPULATION_MAX_VALUES_PER_CRITERION``.
La confianza autorreportada por el LLM no se pide ni se usa (RN-25). El prompt no lleva datos de pacientes (RN-13).
"""

from __future__ import annotations

import json
import re
from collections.abc import Sequence
from pathlib import Path
from typing import Any, Final, Protocol

from pydantic import BaseModel, ConfigDict, ValidationError

from app.application.corpus_metadata.esquema import SalidaInvalida
from app.application.corpus_metadata.poblacion_puertos import Fragmento
from app.domain.aplicabilidad_tipos import ALCANCES, AlcanceDeValor
from app.domain.corpus_metadata.campos import LONGITUD_MAXIMA_DE_VALOR
from app.domain.corpus_metadata.poblacion_abanico import ValorPropuesto

DIRECTORIO_DE_PROMPTS: Final = Path(__file__).parent / "prompts"
_MARCADOR: Final = re.compile(r"\{(clave|etiqueta|maximo|longitud|fragmentos)\}")


class CriterioParaElPrompt(Protocol):
    """Lo único que el prompt toma de un criterio: su clave y su etiqueta (la extracción y el respaldo la comparten)."""

    @property
    def clave(self) -> str: ...

    @property
    def etiqueta_es(self) -> str: ...


class PlantillaDePoblacionNoDisponible(RuntimeError):
    """``POPULATION_PROMPT_VERSION`` no tiene plantilla. El mensaje es solo el nombre de la variable."""


def cargar_plantilla(version: str) -> str:
    """La plantilla versionada ``prompts/<version>.txt``; una versión sin archivo falla cerrada (RN-22)."""
    try:
        return (DIRECTORIO_DE_PROMPTS / f"{version}.txt").read_text(encoding="utf-8")
    except OSError:
        raise PlantillaDePoblacionNoDisponible("POPULATION_PROMPT_VERSION") from None


def esquema_de_poblacion(maximo_de_valores: int) -> dict[str, Any]:
    """Esquema cerrado de la salida; ``maxItems`` es la clave de configuración, nunca un literal."""
    valor = {
        "type": "object",
        "properties": {
            "value": {"type": "string", "maxLength": LONGITUD_MAXIMA_DE_VALOR},
            "chunkId": {"type": "string"},
            "scope": {"type": "string", "enum": list(ALCANCES)},
        },
        "required": ["value", "chunkId", "scope"],
        "additionalProperties": False,
    }
    return {
        "type": "object",
        "properties": {"values": {"type": "array", "maxItems": maximo_de_valores, "items": valor}},
        "required": ["values"],
        "additionalProperties": False,
    }


def construir_prompt(
    plantilla: str,
    criterio: CriterioParaElPrompt,
    fragmentos: Sequence[Fragmento],
    maximo_de_valores: int,
) -> str:
    """Prompt versionado con los fragmentos del corpus público entre delimitadores. Una sola pasada: lo que sustituye a un
    marcador no se vuelve a interpretar (un fragmento no puede inyectar marcadores)."""
    valores = {
        "clave": criterio.clave,
        "etiqueta": criterio.etiqueta_es,
        "maximo": str(maximo_de_valores),
        "longitud": str(LONGITUD_MAXIMA_DE_VALOR),
        "fragmentos": "\n".join(f"[{f.chunk_id}]\n{f.texto}\n" for f in fragmentos),
    }
    return _MARCADOR.sub(lambda m: valores[m.group(1)], plantilla)


class _Cerrado(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class _ValorDeSalida(_Cerrado):
    value: str
    chunkId: str
    scope: AlcanceDeValor


class _SalidaDePoblacion(_Cerrado):
    values: list[_ValorDeSalida]


def parsear_valores(crudo: str) -> tuple[ValorPropuesto, ...]:
    """Los valores de una salida conforme al esquema o ``SalidaInvalida`` (sin eco de la salida: puede traer texto)."""
    try:
        salida = _SalidaDePoblacion.model_validate(json.loads(crudo))
    except (ValueError, TypeError, ValidationError):
        raise SalidaInvalida("la salida del LLM no cumple el esquema") from None
    alcances: dict[str, AlcanceDeValor] = {a: a for a in ALCANCES}
    return tuple(ValorPropuesto(v.value, v.chunkId, alcances[v.scope]) for v in salida.values)
