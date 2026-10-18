"""Reglas puras de la clasificación NLI: probabilidades por clase, etiqueta y validación de los índices (FR-10, RN-01).

Sin E/S. El adapter real aporta los logits del modelo y los índices de clase de la configuración versionada (RN-22);
aquí se decide qué columna es cada clase y cuál es la etiqueta más probable.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Literal

EtiquetaNli = Literal["entailment", "neutral", "contradiction"]
ETIQUETAS_NLI: tuple[EtiquetaNli, ...] = ("entailment", "neutral", "contradiction")
NUMERO_DE_CLASES = len(ETIQUETAS_NLI)


class IndicesDeClaseInvalidos(ValueError):
    """Los índices de clase no son tres enteros distintos dentro de [0, 2]; ``clase`` nombra la etiqueta infractora.

    El mensaje es solo el nombre de la clase: nunca el valor configurado.
    """

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
    """Tres enteros distintos en [0, 2]: un mapeo que repite o sale del rango invertiría el soporte (RN-01)."""
    vistos: set[int] = set()
    for clase in ETIQUETAS_NLI:
        valor = getattr(indices, clase)
        if isinstance(valor, bool) or not isinstance(valor, int):
            raise IndicesDeClaseInvalidos(clase)
        if not 0 <= valor < NUMERO_DE_CLASES or valor in vistos:
            raise IndicesDeClaseInvalidos(clase)
        vistos.add(valor)
    return indices


def calcular_probabilidades(logits: Sequence[float], indices: IndicesDeClase) -> ProbabilidadesNli:
    """Softmax estable de los tres logits; ``indices`` dice qué columna es cada clase. Una salida que no es de tres
    clases finitas rompe el contrato (``ValueError``) en vez de disfrazarse de probabilidad."""
    if len(logits) != NUMERO_DE_CLASES or not all(math.isfinite(x) for x in logits):
        raise ValueError("el NLI debe devolver tres logits finitos")
    mayor = max(logits)
    pesos = [math.exp(x - mayor) for x in logits]
    total = sum(pesos)
    return ProbabilidadesNli(
        entailment=pesos[indices.entailment] / total,
        neutral=pesos[indices.neutral] / total,
        contradiction=pesos[indices.contradiction] / total,
    )


def etiqueta_mas_probable(probabilidades: ProbabilidadesNli) -> EtiquetaNli:
    """Argmax; un empate se resuelve en el orden fijo de ``ETIQUETAS_NLI`` para que el resultado sea determinista."""
    return max(
        ETIQUETAS_NLI,
        key=lambda clase: (getattr(probabilidades, clase), -ETIQUETAS_NLI.index(clase)),
    )
