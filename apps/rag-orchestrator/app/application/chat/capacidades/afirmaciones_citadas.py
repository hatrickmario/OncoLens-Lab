"""Generación de afirmaciones citadas de un nodo del chat (US-265, US-264): parámetros de configuración y esquema de la
salida del LLM que comparten el seguimiento de un análisis y la relevancia de un dato. No son contrato entre servicios."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.domain.alias_de_chunks import PATRON_DE_ALIAS


@dataclass(frozen=True)
class ParametrosDeGeneracionCitada:
    """Valores de configuración de la generación (RN-22), los mismos que usa el análisis: un solo mapeo desde ``Settings``."""

    claims_min: int
    claims_max: int
    claim_max_words: int
    max_chars_fragmentos: int
    num_ctx: int = 0
    """``LLM_NUM_CTX``: solo para medir el tamaño del prompt (no cambia ningún comportamiento)."""


class AfirmacionCruda(BaseModel):
    model_config = ConfigDict(extra="ignore")

    texto: str = Field(alias="text", min_length=1)
    citas: list[str] = Field(alias="citations")


class SalidaCruda(BaseModel):
    """Esquema interno de la salida del LLM de la generación citada (no es contrato entre servicios)."""

    model_config = ConfigDict(extra="ignore")

    afirmaciones: list[AfirmacionCruda] = Field(alias="claims")


def esquema_de_la_salida(claims_max: int) -> dict[str, Any]:
    """Esquema entregado al LLM: hasta ``claims_max`` afirmaciones y alias con el formato de la consulta."""
    esquema = SalidaCruda.model_json_schema()
    esquema["properties"]["claims"]["maxItems"] = claims_max
    esquema["$defs"]["AfirmacionCruda"]["properties"]["citations"]["items"] = {
        "type": "string",
        "pattern": PATRON_DE_ALIAS,
    }
    return esquema
