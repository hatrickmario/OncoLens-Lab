"""RN-23: verificador de términos prohibidos (gemelo Python de ``packages/clinical-language``). Puro."""

from __future__ import annotations

from collections.abc import Sequence
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Nivel = Literal["A", "B"]


class _Modelo(BaseModel):
    model_config = ConfigDict(frozen=True, populate_by_name=True)


class TerminoProhibido(_Modelo):
    id: str
    idioma: str
    texto: str
    formas: list[str] | None = None
    excepciones: list[str] | None = None


class PrefijoProhibido(_Modelo):
    id: str
    idioma: str
    prefijo: str


class NivelA(_Modelo):
    aplica_a: list[str] = Field(alias="aplicaA")
    terminos: list[TerminoProhibido]


class NivelB(_Modelo):
    aplica_a: list[str] = Field(alias="aplicaA")
    prefijos: list[PrefijoProhibido]
    terminos: list[TerminoProhibido]


class FrasesPermitidas(_Modelo):
    aplica_a: list[str] = Field(alias="aplicaA")
    frases: list[str]


class ListaTerminos(_Modelo):
    version: str
    normalizacion: str
    nivel_a: NivelA = Field(alias="nivelA")
    nivel_b: NivelB = Field(alias="nivelB")
    frases_permitidas: FrasesPermitidas = Field(alias="frasesPermitidas")


class Coincidencia(_Modelo):
    id: str
    termino: str
    nivel: Nivel


def check_prohibited_terms(
    texto: str,
    lista: ListaTerminos,
    niveles: Sequence[Nivel] = ("A",),
    permitir_frases: bool = False,
) -> list[Coincidencia]:
    raise NotImplementedError("no implementado")
