"""Esquema JSON y prompt de la extracción de metadatos (US-118, D3, D7).

El esquema cerrado se construye desde ``app/domain/corpus_metadata/campos`` (las claves que nombra ``studyKey``): una
clave fuera de ese conjunto no se puede expresar ni se acepta al validar. La confianza autorreportada por el LLM no se
pide ni se usa (RN-25).
"""

from __future__ import annotations

import json
from collections.abc import Sequence
from pathlib import Path
from typing import Annotated, Any, Final, Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StrictInt,
    ValidationError,
    create_model,
    field_validator,
)

from app.domain.corpus_metadata.campos import (
    CAMPOS_ESCALARES,
    CRITERIOS_PLANOS,
    DISENOS_EXTRAIBLES,
    FASES_DE_ENSAYO,
    LONGITUD_MAXIMA_DE_VALOR,
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


_Valor = Annotated[str, Field(max_length=LONGITUD_MAXIMA_DE_VALOR)]


def _modelo_cerrado(nombre: str, campos: dict[str, Any]) -> type[_Cerrado]:
    """Modelo Pydantic cerrado cuyos campos de texto salen de ``campos.py`` (fuente única de las claves, D7)."""
    textos = [c for c, (tipo, _) in campos.items() if tipo == _Valor | None]
    return create_model(  # type: ignore[call-overload,no-any-return]
        nombre,
        __base__=_Cerrado,
        __validators__={"limpiar": field_validator(*textos, mode="before")(_texto_o_nulo)},
        **campos,
    )


_Biomarcadores = _modelo_cerrado(
    "_Biomarcadores", {s: (_Valor | None, None) for s in SUBCLAVES_DE_BIOMARCADORES}
)
_Poblacion = _modelo_cerrado(
    "_Poblacion",
    {
        **{c: (_Valor | None, None) for c in CRITERIOS_PLANOS},
        "biomarcadores": (_Biomarcadores | None, None),
    },
)


class PropuestaDeMetadatos(_Cerrado):
    study_design: Literal[DISENOS_EXTRAIBLES] | None = None  # type: ignore[valid-type]
    trial_phase: Literal[FASES_DE_ENSAYO] | None = None  # type: ignore[valid-type]
    sample_size: StrictInt | None = None
    primary_endpoint: _Valor | None = None
    population_criteria: _Poblacion | None = None  # type: ignore[valid-type]

    _limpiar = field_validator("primary_endpoint", mode="before")(_texto_o_nulo)

    @field_validator("sample_size")
    @classmethod
    def _entero_positivo(cls, valor: int | None) -> int | None:
        if valor is not None and valor <= 0:
            raise ValueError("sample_size debe ser mayor que 0")
        return valor

    def campos(self) -> tuple[CampoDeMetadato, ...]:
        """Los valores propuestos (no nulos), en orden canónico y con el nombre de campo de ``studyKey``."""
        return (*self._escalares_propuestos(), *self._criterios_propuestos())

    def _escalares_propuestos(self) -> tuple[CampoDeMetadato, ...]:
        return tuple(
            CampoDeMetadato(nombre, valor)
            for nombre in CAMPOS_ESCALARES
            if (valor := getattr(self, nombre)) is not None
        )

    def _criterios_propuestos(self) -> tuple[CampoDeMetadato, ...]:
        poblacion = self.population_criteria
        if poblacion is None:
            return ()
        planos = (
            CampoDeMetadato(nombre, valor)
            for nombre in CRITERIOS_PLANOS
            if (valor := getattr(poblacion, nombre)) is not None
        )
        biomarcadores = poblacion.biomarcadores
        de_biomarcadores = (
            CampoDeMetadato(f"biomarcadores.{subclave}", valor)
            for subclave in SUBCLAVES_DE_BIOMARCADORES
            if biomarcadores is not None and (valor := getattr(biomarcadores, subclave)) is not None
        )
        return (*planos, *de_biomarcadores)


def _nulable(tipo: str, **extra: Any) -> dict[str, Any]:
    return {"type": [tipo, "null"], **extra}


def _texto_nulable() -> dict[str, Any]:
    return _nulable("string", maxLength=LONGITUD_MAXIMA_DE_VALOR)


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
        {subclave: _texto_nulable() for subclave in SUBCLAVES_DE_BIOMARCADORES}, nulable=True
    )
    poblacion = _objeto(
        {
            **{criterio: _texto_nulable() for criterio in CRITERIOS_PLANOS},
            "biomarcadores": biomarcadores,
        },
        nulable=True,
    )
    return _objeto(
        {
            "study_design": _nulable("string", enum=[*DISENOS_EXTRAIBLES, None]),
            "trial_phase": _nulable("string", enum=[*FASES_DE_ENSAYO, None]),
            "sample_size": _nulable("integer", minimum=1),
            "primary_endpoint": _texto_nulable(),
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
