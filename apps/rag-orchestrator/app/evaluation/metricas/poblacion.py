"""Métricas puras de la familia `poblacion` (L1D-299, US-233b): precisión y cobertura por criterio, duplicados, cortes por
longitud, concordancia de estados, regresión de «sin evidencia», tasa del bucle y veredicto. Sin E/S ni reloj."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass


@dataclass(frozen=True)
class ParMedido:
    """Un par (documento, criterio) del dorado: lo esperado y lo que la extracción guardó, ya normalizados."""

    documento: str
    criterio: str
    esperados: frozenset[str]
    obtenidos: tuple[str, ...]


@dataclass(frozen=True)
class Fraccion:
    aciertos: int
    total: int

    @property
    def valor(self) -> float | None:
        """``None`` (≠ ``0.0``) cuando no hay nada que medir."""
        return None if self.total == 0 else self.aciertos / self.total


def precision_por_criterio(pares: Sequence[ParMedido]) -> dict[str, Fraccion]:
    raise NotImplementedError("no implementado")


def cobertura_por_criterio(pares: Sequence[ParMedido]) -> dict[str, Fraccion]:
    raise NotImplementedError("no implementado")


def tasa_duplicados(pares: Sequence[ParMedido]) -> Fraccion:
    raise NotImplementedError("no implementado")


def cortes_por_longitud(tareas: Sequence[tuple[str, str, str]]) -> list[tuple[str, str]]:
    raise NotImplementedError("no implementado")


@dataclass(frozen=True)
class CasoDeEstado:
    id: str
    esperado: str
    calculado: str


@dataclass(frozen=True)
class ConcordanciaDeEstados:
    por_estado: Mapping[str, Fraccion]
    total: Fraccion
    no_coincide_indebido: int
    coincide_indebido: int


def concordancia_de_estados(casos: Sequence[CasoDeEstado]) -> ConcordanciaDeEstados:
    raise NotImplementedError("no implementado")


@dataclass(frozen=True)
class RegresionSinEvidencia:
    baseline: float | None
    actual: float | None
    baja: bool
    invocaciones_llm: int
    top_relevance_no_nulos: int

    @property
    def violada(self) -> bool:
        return self.baja or self.invocaciones_llm > 0 or self.top_relevance_no_nulos > 0


def sin_evidencia_vs_baseline(
    baseline: float | None, actual: float | None, invocaciones_llm: int, top_relevance_no_nulos: int
) -> RegresionSinEvidencia:
    raise NotImplementedError("no implementado")


@dataclass(frozen=True)
class TasaDelBucle:
    pares: int
    cortes: int
    tasa: float | None
    minimo_de_pares: int
    out06: str


def tasa_cortes_del_bucle(pares: int, pares_con_corte: int, minimo_de_pares: int) -> TasaDelBucle:
    raise NotImplementedError("no implementado")


@dataclass(frozen=True)
class Veredicto:
    resultado: str
    causas: tuple[str, ...]
    invariantes_violadas: tuple[str, ...]


def veredicto(
    *,
    cortes: int,
    sin_evidencia_violada: bool,
    revisor_completo: bool,
    pares_del_dorado: int,
    minimo_de_pares: int,
    marcas: Sequence[str],
) -> Veredicto:
    raise NotImplementedError("no implementado")
