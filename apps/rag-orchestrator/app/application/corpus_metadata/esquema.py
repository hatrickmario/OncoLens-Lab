"""Esquema JSON y prompt de la extracción de metadatos (US-118, D3, D7).

El esquema cerrado se construye desde ``app/domain/corpus_metadata/campos`` (las claves que nombra ``studyKey``): una
clave fuera de ese conjunto no se puede expresar ni se acepta al validar. La confianza autorreportada por el LLM no se
pide ni se usa (RN-25).
"""

from __future__ import annotations

import json
from collections.abc import Sequence
from pathlib import Path
from typing import Any, Final, Literal

from pydantic import BaseModel, ConfigDict, StrictInt, ValidationError, field_validator

from app.domain.corpus_metadata.campos import (
    CRITERIOS_PLANOS,
    DISENOS_EXTRAIBLES,
    FASES_DE_ENSAYO,
    SUBCLAVES_DE_BIOMARCADORES,
)
from app.domain.corpus_metadata.resultado import CampoDeMetadato

PROMPT_VERSION: Final = "metadatos_v1"
_PLANTILLA: Final = (Path(__file__).parent / "prompts" / f"{PROMPT_VERSION}.txt").read_text(
    encoding="utf-8"
)


class SalidaInvalida(ValueError):
    """La salida del LLM no es un JSON conforme al esquema: el mensaje nunca lleva la salida (RN-10)."""


def _texto_o_nulo(valor: object) -> object:
    if isinstance(valor, str):
        return valor.strip() or None
    return valor


class _Cerrado(BaseModel):
    model_config = ConfigDict(extra="forbid")


class _Biomarcadores(_Cerrado):
    her2: str | None = None
    receptores_hormonales: str | None = None
    hrr_brca: str | None = None

    _limpiar = field_validator("*", mode="before")(_texto_o_nulo)


class _Poblacion(_Cerrado):
    subtipo: str | None = None
    estadio: str | None = None
    linea: str | None = None
    biomarcadores: _Biomarcadores | None = None
    edad: str | None = None
    ecog: str | None = None

    _limpiar = field_validator("subtipo", "estadio", "linea", "edad", "ecog", mode="before")(
        _texto_o_nulo
    )


class PropuestaDeMetadatos(_Cerrado):
    study_design: Literal["guia", "eca", "observacional", "revision_sistematica"] | None = None
    trial_phase: Literal["I", "II", "III", "IV"] | None = None
    sample_size: StrictInt | None = None
    primary_endpoint: str | None = None
    population_criteria: _Poblacion | None = None

    _limpiar = field_validator("primary_endpoint", mode="before")(_texto_o_nulo)

    @field_validator("sample_size")
    @classmethod
    def _entero_positivo(cls, valor: int | None) -> int | None:
        if valor is not None and valor <= 0:
            raise ValueError("sample_size debe ser mayor que 0")
        return valor

    def campos(self) -> tuple[CampoDeMetadato, ...]:
        """Los valores propuestos (no nulos), en orden canónico y con el nombre de campo de ``studyKey``."""
        propuestos: list[CampoDeMetadato] = []
        for nombre in ("study_design", "trial_phase", "sample_size", "primary_endpoint"):
            valor = getattr(self, nombre)
            if valor is not None:
                propuestos.append(CampoDeMetadato(nombre, valor))
        poblacion = self.population_criteria
        if poblacion is None:
            return tuple(propuestos)
        for nombre in CRITERIOS_PLANOS:
            valor = getattr(poblacion, nombre)
            if valor is not None:
                propuestos.append(CampoDeMetadato(nombre, valor))
        if poblacion.biomarcadores is not None:
            for subclave in SUBCLAVES_DE_BIOMARCADORES:
                valor = getattr(poblacion.biomarcadores, subclave)
                if valor is not None:
                    propuestos.append(CampoDeMetadato(f"biomarcadores.{subclave}", valor))
        return tuple(propuestos)


def _nulable(tipo: str, **extra: Any) -> dict[str, Any]:
    return {"type": [tipo, "null"], **extra}


def _objeto(propiedades: dict[str, Any], *, nulable: bool = False) -> dict[str, Any]:
    return {
        "type": ["object", "null"] if nulable else "object",
        "properties": propiedades,
        "required": list(propiedades),
        "additionalProperties": False,
    }


def esquema_de_metadatos() -> dict[str, Any]:
    """Esquema JSON cerrado: todas las claves obligatorias y anulables (``null`` = el texto no lo declara)."""
    biomarcadores = _objeto(
        {subclave: _nulable("string") for subclave in SUBCLAVES_DE_BIOMARCADORES}, nulable=True
    )
    poblacion = _objeto(
        {
            **{criterio: _nulable("string") for criterio in CRITERIOS_PLANOS},
            "biomarcadores": biomarcadores,
        },
        nulable=True,
    )
    return _objeto(
        {
            "study_design": _nulable("string", enum=[*DISENOS_EXTRAIBLES, None]),
            "trial_phase": _nulable("string", enum=[*FASES_DE_ENSAYO, None]),
            "sample_size": _nulable("integer", minimum=1),
            "primary_endpoint": _nulable("string"),
            "population_criteria": poblacion,
        }
    )


def construir_prompt(titulo: str, texto: str, campos_solicitados: Sequence[str]) -> str:
    """Prompt versionado con el texto del corpus (público). Las llaves del texto no se interpretan."""
    return (
        _PLANTILLA.replace("{campos}", ", ".join(campos_solicitados))
        .replace("{titulo}", titulo)
        .replace("{texto}", texto)
    )


def parsear_propuesta(crudo: str) -> PropuestaDeMetadatos:
    """JSON conforme al esquema o ``SalidaInvalida`` (sin eco de la salida: puede traer texto del documento)."""
    try:
        return PropuestaDeMetadatos.model_validate(json.loads(crudo))
    except (ValueError, TypeError, ValidationError):
        raise SalidaInvalida("la salida del LLM no cumple el esquema") from None
