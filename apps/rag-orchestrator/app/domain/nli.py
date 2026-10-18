"""Reglas puras de la clasificación NLI: probabilidades por clase, etiqueta y validación de los índices (FR-10, RN-01).

Sin E/S. El adapter real aporta los logits del modelo y los índices de clase de la configuración versionada (RN-22);
aquí se decide qué columna es cada clase y cuál es la etiqueta más probable.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Literal

EtiquetaNli = Literal["entailment", "neutral", "contradiction"]
ETIQUETAS_NLI: tuple[EtiquetaNli, ...] = ("entailment", "neutral", "contradiction")


class IndicesDeClaseInvalidos(ValueError):
    """Los índices de clase no son tres enteros distintos dentro de [0, 2]; ``clase`` nombra la etiqueta infractora."""

    def __init__(self, clase: EtiquetaNli) -> None:
        super().__init__(clase)
        self.clase = clase


@dataclass(frozen=True)
class IndicesDeClase:
    """Columna de cada clase en la salida del modelo (configuración versionada; nunca el ``config.json`` del modelo)."""

    entailment: int
    neutral: int
    contradiction: int


@dataclass(frozen=True)
class ProbabilidadesNli:
    entailment: float
    neutral: float
    contradiction: float


def validar_indices_de_clase(indices: IndicesDeClase) -> IndicesDeClase:
    raise NotImplementedError("no implementado")


def calcular_probabilidades(logits: Sequence[float], indices: IndicesDeClase) -> ProbabilidadesNli:
    raise NotImplementedError("no implementado")


def etiqueta_mas_probable(probabilidades: ProbabilidadesNli) -> EtiquetaNli:
    raise NotImplementedError("no implementado")
