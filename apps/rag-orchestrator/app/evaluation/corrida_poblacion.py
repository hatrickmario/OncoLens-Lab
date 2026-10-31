"""Corrida de la familia `poblacion` de `evaluate` (L1D-299, US-233b)."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class MedicionSinEvidencia:
    """Lo que la suite `all` mide de «sin evidencia» (RN-02): la exactitud y las violaciones del camino sin evidencia."""

    exactitud: float | None
    invocaciones_llm: int
    top_relevance_no_nulos: int


@dataclass(frozen=True)
class PuertosDePoblacion:
    """Bordes que un test puede sustituir; sin ellos la familia mide «sin evidencia» corriendo la suite `all`."""

    medidor_sin_evidencia: Callable[[Path], MedicionSinEvidencia] | None = None
