"""Soporte de las afirmaciones generadas (RN-01) y retiro del lenguaje no permitido (RN-23): reglas puras, sin E/S."""

from __future__ import annotations

from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass

from app.domain.citations import OpcionAceptada, OpcionGenerada
from app.domain.nli import ParNli, ResultadoNli

CAMPOS_GENERADOS = ("option", "rationale", "unsupportedClaims", "limitations[].text", "synthesis")
RETIRO_ES = "[afirmación retirada: formulación no permitida]"
RETIRO_EN = "[claim removed: disallowed wording]"

BuscadorDeTerminos = Callable[[str, str], Sequence[str]]
"""``(texto, campo) -> ids de regla``: el puerto ``ProhibitedTermsChecker`` visto desde el dominio."""


@dataclass(frozen=True)
class Afirmacion:
    """Un fragmento generado, el campo del que sale y las reglas de lenguaje que incumple (vacío = limpio)."""

    texto: str
    campo: str
    reglas: tuple[str, ...]
    premisas: tuple[str, ...]


@dataclass(frozen=True)
class RetiroDeLenguaje:
    """Un fragmento retirado por lenguaje no permitido: solo el campo y las reglas, jamás el texto (RN-23, RN-10)."""

    campo: str
    reglas: tuple[str, ...]


@dataclass(frozen=True)
class OpcionPlanificada:
    aceptada: OpcionAceptada
    option: Afirmacion
    afirmaciones: tuple[Afirmacion, ...]


@dataclass(frozen=True)
class PlanDeSoporte:
    opciones: tuple[OpcionPlanificada, ...]
    limitaciones: tuple[Afirmacion, ...]

    @property
    def retiros(self) -> tuple[RetiroDeLenguaje, ...]:
        raise NotImplementedError("no implementado")


@dataclass(frozen=True)
class OpcionSinSoporte:
    opcion: OpcionGenerada
    afirmaciones_sin_soporte: tuple[str, ...]


@dataclass(frozen=True)
class ResultadoSoporte:
    soportadas: tuple[OpcionAceptada, ...]
    descartadas: tuple[OpcionSinSoporte, ...]
    limitaciones: tuple[str, ...]
    omitidas: int


def literal_de_retiro(idioma: str) -> str:
    raise NotImplementedError("no implementado")


def soporta(resultado: ResultadoNli, umbral: float) -> bool:
    raise NotImplementedError("no implementado")


def planificar_soporte(
    aceptadas: Sequence[OpcionAceptada],
    limitaciones_propuestas: Sequence[str],
    textos_de_chunks: Mapping[str, str],
    buscar_terminos: BuscadorDeTerminos,
) -> PlanDeSoporte:
    raise NotImplementedError("no implementado")


def pares_a_verificar(plan: PlanDeSoporte) -> list[ParNli]:
    raise NotImplementedError("no implementado")


def verificar_soporte(
    plan: PlanDeSoporte, resultados: Sequence[ResultadoNli], umbral: float, idioma: str
) -> ResultadoSoporte:
    raise NotImplementedError("no implementado")


def retirar_texto_prohibido(
    opcion: OpcionGenerada, buscar_terminos: BuscadorDeTerminos, idioma: str
) -> tuple[OpcionGenerada, tuple[RetiroDeLenguaje, ...]]:
    raise NotImplementedError("no implementado")
