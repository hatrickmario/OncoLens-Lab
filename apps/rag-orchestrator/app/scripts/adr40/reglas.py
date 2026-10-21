"""Reglas puras de la medicion de ADR-40 (US-013): sensibilidad por tipo, falsos positivos clinicos y eleccion.

Sin E/S. La regla de eleccion (design D2) se fijo antes de medir: se descarta al candidato con sensibilidad menor que
el minimo (G-8) en algun identificador directo etiquetado o con memoria que no cabe; entre los que cumplen gana el
mas simple (el primero de la lista, ordenada de menor a mayor complejidad). Un valor ``None`` es "sin medir" o "sin
etiquetas de ese tipo" (distinto de 0.0): el candidato no cumple por ese tipo y nunca se inventa una cifra. El minimo
y el margen de memoria llegan por parametro desde la configuracion (RN-22).
"""

from __future__ import annotations

import random
from collections import Counter
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field

__all__ = [
    "Control",
    "Decision",
    "FalsosPositivos",
    "Medicion",
    "Sensibilidad",
    "Span",
    "TOTAL",
    "elegir_mas_simple_que_cumple",
    "esta_cubierta",
    "falsos_positivos_clinicos",
    "sensibilidad_por_tipo",
]

TOTAL = "total"


@dataclass(frozen=True)
class Span:
    inicio: int
    fin: int
    tipo: str


@dataclass(frozen=True)
class Control:
    """Termino clinico que NO es PII (p. ej. ``HER2``); si un detector lo cubre, es un falso positivo."""

    termino: str
    inicio: int
    fin: int
    critico: bool


@dataclass(frozen=True)
class Sensibilidad:
    aciertos: int
    total: int
    valor: float | None
    ic95: tuple[float, float] | None


@dataclass(frozen=True)
class FalsosPositivos:
    controles: int
    marcados: int
    tasa: float | None
    por_termino: Mapping[str, int]
    criticos_marcados: Mapping[str, int]


@dataclass(frozen=True)
class Medicion:
    """Cifras de un candidato; ``elegible=False`` lo deja como referencia (p. ej. la configuracion actual)."""

    id: str
    sensibilidad: Mapping[str, float | None]
    memoria_mb: float | None = None
    elegible: bool = True


@dataclass(frozen=True)
class Decision:
    elegido: str | None
    descartes: Sequence[tuple[str, str]] = field(default_factory=tuple)


def _caracteres_cubiertos(objetivo: Span, hallazgos: Sequence[Span]) -> int:
    cubiertos = {
        posicion
        for h in hallazgos
        for posicion in range(max(h.inicio, objetivo.inicio), min(h.fin, objetivo.fin))
    }
    return len(cubiertos)


def esta_cubierta(objetivo: Span, hallazgos: Sequence[Span], minimo_cobertura: float) -> bool:
    """El span etiquetado queda enmascarado si los hallazgos (de cualquier tipo) cubren al menos esa fraccion."""
    longitud = objetivo.fin - objetivo.inicio
    return (
        longitud > 0 and _caracteres_cubiertos(objetivo, hallazgos) / longitud >= minimo_cobertura
    )


def _intervalo_bootstrap(
    aciertos: Sequence[bool], remuestreos: int, semilla: int
) -> tuple[float, float]:
    azar = random.Random(semilla)
    n = len(aciertos)
    tasas = sorted(
        sum(aciertos[int(azar.random() * n)] for _ in range(n)) / n for _ in range(remuestreos)
    )
    return tasas[int(0.025 * (remuestreos - 1))], tasas[int(0.975 * (remuestreos - 1))]


def _sensibilidad(aciertos: Sequence[bool], remuestreos: int, semilla: int) -> Sensibilidad:
    if not aciertos:
        return Sensibilidad(0, 0, None, None)
    return Sensibilidad(
        sum(aciertos),
        len(aciertos),
        sum(aciertos) / len(aciertos),
        _intervalo_bootstrap(aciertos, remuestreos, semilla),
    )


def sensibilidad_por_tipo(
    resultados: Sequence[tuple[Sequence[Span], Sequence[Span]]],
    minimo_cobertura: float,
    remuestreos: int,
    semilla: int,
) -> dict[str, Sensibilidad]:
    """Sensibilidad por tipo etiquetado y ``total`` (IC 95 % bootstrap). ``resultados``: (etiquetas, hallazgos) por texto."""
    por_tipo: dict[str, list[bool]] = {}
    for etiquetas, hallazgos in resultados:
        for etiqueta in etiquetas:
            por_tipo.setdefault(etiqueta.tipo, []).append(
                esta_cubierta(etiqueta, hallazgos, minimo_cobertura)
            )
    todos = [acierto for aciertos in por_tipo.values() for acierto in aciertos]
    medidas = {tipo: _sensibilidad(a, remuestreos, semilla) for tipo, a in sorted(por_tipo.items())}
    medidas[TOTAL] = _sensibilidad(todos, remuestreos, semilla)
    return medidas


def falsos_positivos_clinicos(
    resultados: Sequence[tuple[Sequence[Control], Sequence[Span]]],
) -> FalsosPositivos:
    """Controles clinicos que algun hallazgo toca (al menos un caracter): lo que se enmascararia por error."""
    marcados: Counter[str] = Counter()
    criticos: Counter[str] = Counter()
    total = 0
    for controles, hallazgos in resultados:
        for control in controles:
            total += 1
            tocado = any(h.inicio < control.fin and control.inicio < h.fin for h in hallazgos)
            if tocado:
                marcados[control.termino] += 1
                if control.critico:
                    criticos[control.termino] += 1
    return FalsosPositivos(
        controles=total,
        marcados=sum(marcados.values()),
        tasa=sum(marcados.values()) / total if total else None,
        por_termino=dict(sorted(marcados.items())),
        criticos_marcados=dict(sorted(criticos.items())),
    )


def _motivo_de_descarte(
    medicion: Medicion,
    minimo: float,
    tipos_requeridos: Sequence[str],
    memoria_maxima_mb: float | None,
) -> str | None:
    for tipo in tipos_requeridos:
        valor = medicion.sensibilidad.get(tipo)
        if valor is None:
            return f"sensibilidad de {tipo} sin medir"
        if valor < minimo:
            return f"sensibilidad de {tipo} {valor:.3f} < {minimo:.2f}"
    if memoria_maxima_mb is not None and medicion.memoria_mb is not None:
        if medicion.memoria_mb > memoria_maxima_mb:
            return f"memoria {medicion.memoria_mb:.0f} MB > margen {memoria_maxima_mb:.0f} MB"
    return None


def elegir_mas_simple_que_cumple(
    mediciones: Sequence[Medicion],
    minimo: float,
    tipos_requeridos: Sequence[str],
    memoria_maxima_mb: float | None = None,
) -> Decision:
    """Primer candidato elegible (la lista va de mas simple a mas complejo) que cumple en todos los tipos requeridos."""
    descartes: list[tuple[str, str]] = []
    elegido: str | None = None
    for medicion in mediciones:
        motivo = _motivo_de_descarte(medicion, minimo, tipos_requeridos, memoria_maxima_mb)
        if motivo is not None:
            descartes.append((medicion.id, motivo))
        elif medicion.elegible and elegido is None:
            elegido = medicion.id
    return Decision(elegido, tuple(descartes))
