"""Reglas puras de la fase B de ADR-39 (US-224): descarte por restricción dura, empate por memoria y validación de JSON.

Sin E/S. Aplican las reglas de decisión de design.md D3, fijadas antes de medir: las eliminatorias se evalúan en
orden y la primera que falla descarta con su cifra. Un valor ``None`` es "sin medir" (≠ 0): el candidato queda
``pendiente`` y nunca elegible; esta función no inventa cifras. Los límites llegan por parámetro desde la configuración
(RN-22), nunca como constantes del código.
"""

from __future__ import annotations

import json
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any, Literal

import jsonschema

from app.evaluation.medicion_modelos import mediana, percentil_95

__all__ = [
    "Candidato",
    "Decision",
    "Descarte",
    "Restricciones",
    "Veredicto",
    "decidir_candidato",
    "descartar_por_restriccion",
    "desempatar_por_memoria",
    "elegir_candidato",
    "mediana",
    "percentil_95",
    "porcentaje_json_valido",
    "validar_contra_esquema",
]

Estado = Literal["elegible", "descartado", "pendiente"]


@dataclass(frozen=True)
class Restricciones:
    llm_memory_budget_gb: float
    stack_memory_limit_gb: float
    json_valido_minimo: float
    e2e_p95_budget_ms: float
    extraccion_p95_budget_ms: float
    fidelidad_minima: float
    salidas_prescriptivas_maximas: int
    salidas_otro_idioma_maximas: int
    margen_de_seguridad_gb: float
    licencias_academicas: frozenset[str]
    licencias_condicionadas: frozenset[str]


@dataclass(frozen=True)
class Candidato:
    """Cifras medidas (mediana de las corridas) de un candidato de LLM; ``None`` = sin medir."""

    id: str
    licencia: str
    licencia_verificada: bool = True
    memoria_llm_gb: float | None = None
    memoria_stack_gb: float | None = None
    swap_creciente: bool | None = None
    json_valido: float | None = None
    e2e_p95_ms: float | None = None
    extraccion_p95_ms: float | None = None
    fidelidad: float | None = None
    salidas_prescriptivas: int | None = None
    salidas_otro_idioma: int | None = None


@dataclass(frozen=True)
class Descarte:
    candidato: str
    eliminatoria: str
    cifra: str


@dataclass(frozen=True)
class Veredicto:
    candidato: str
    estado: Estado
    descarte: Descarte | None
    pendientes: tuple[str, ...]


@dataclass(frozen=True)
class Decision:
    elegido: Candidato | None
    desempatado_por_memoria: bool
    veredictos: tuple[Veredicto, ...]
    riesgo_de_margen: tuple[str, ...]
    respaldo: Candidato | None
    escalar_al_usuario: bool

    @property
    def descartados(self) -> tuple[Descarte, ...]:
        return tuple(v.descarte for v in self.veredictos if v.descarte is not None)


def descartar_por_restriccion(c: Candidato, r: Restricciones) -> Descarte | None:
    """Primera eliminatoria incumplida con su cifra (NFR-01, NFR-05, licencia, JSON, calidad), o ``None``.

    Orden de D3: licencia, memoria del LLM, memoria del stack y swap, JSON válido, p95 y calidad en español.
    """
    for revisar in (
        _licencia,
        _memoria_llm,
        _memoria_stack,
        _json_valido,
        _p95,
        _calidad_en_espanol,
    ):
        descarte = revisar(c, r)
        if descarte is not None:
            return descarte
    return None


def _licencia(c: Candidato, r: Restricciones) -> Descarte | None:
    if c.licencia in r.licencias_academicas or c.licencia in r.licencias_condicionadas:
        return None
    return Descarte(c.id, "licencia", f"{c.licencia!r} fuera de las licencias académicas")


def _memoria_llm(c: Candidato, r: Restricciones) -> Descarte | None:
    if c.memoria_llm_gb is not None and c.memoria_llm_gb > r.llm_memory_budget_gb:
        return Descarte(
            c.id, "memoria_llm", f"{c.memoria_llm_gb:.2f} GB > {r.llm_memory_budget_gb:.1f} GB"
        )
    return None


def _memoria_stack(c: Candidato, r: Restricciones) -> Descarte | None:
    if c.memoria_stack_gb is not None and c.memoria_stack_gb > r.stack_memory_limit_gb:
        return Descarte(
            c.id,
            "memoria_stack",
            f"{c.memoria_stack_gb:.2f} GB > {r.stack_memory_limit_gb:.1f} GB",
        )
    if c.swap_creciente:
        return Descarte(c.id, "swap", "el swap usado crece durante la corrida extremo a extremo")
    return None


def _json_valido(c: Candidato, r: Restricciones) -> Descarte | None:
    if c.json_valido is not None and c.json_valido < r.json_valido_minimo:
        return Descarte(c.id, "json_valido", f"{c.json_valido:.4f} < {r.json_valido_minimo:.2f}")
    return None


def _p95(c: Candidato, r: Restricciones) -> Descarte | None:
    if c.e2e_p95_ms is not None and c.e2e_p95_ms > r.e2e_p95_budget_ms:
        return Descarte(c.id, "p95_e2e", f"{c.e2e_p95_ms:.0f} ms > {r.e2e_p95_budget_ms:.0f} ms")
    if c.extraccion_p95_ms is not None and c.extraccion_p95_ms > r.extraccion_p95_budget_ms:
        return Descarte(
            c.id,
            "p95_extraccion",
            f"{c.extraccion_p95_ms:.0f} ms > {r.extraccion_p95_budget_ms:.0f} ms",
        )
    return None


def _calidad_en_espanol(c: Candidato, r: Restricciones) -> Descarte | None:
    if c.fidelidad is not None and c.fidelidad < r.fidelidad_minima:
        return Descarte(c.id, "fidelidad", f"{c.fidelidad:.2f} < {r.fidelidad_minima:.2f}")
    if (
        c.salidas_prescriptivas is not None
        and c.salidas_prescriptivas > r.salidas_prescriptivas_maximas
    ):
        return Descarte(
            c.id,
            "prescriptivo",
            f"{c.salidas_prescriptivas} salidas > {r.salidas_prescriptivas_maximas} (RN-23)",
        )
    if c.salidas_otro_idioma is not None and c.salidas_otro_idioma > r.salidas_otro_idioma_maximas:
        return Descarte(
            c.id,
            "otro_idioma",
            f"{c.salidas_otro_idioma} salidas > {r.salidas_otro_idioma_maximas}",
        )
    return None


def _cifras_pendientes(c: Candidato) -> tuple[str, ...]:
    campos = {
        "licencia_verificada": c.licencia_verificada or None,
        "memoria_llm_gb": c.memoria_llm_gb,
        "memoria_stack_gb": c.memoria_stack_gb,
        "swap_creciente": c.swap_creciente,
        "json_valido": c.json_valido,
        "e2e_p95_ms": c.e2e_p95_ms,
        "extraccion_p95_ms": c.extraccion_p95_ms,
        "fidelidad": c.fidelidad,
        "salidas_prescriptivas": c.salidas_prescriptivas,
        "salidas_otro_idioma": c.salidas_otro_idioma,
    }
    return tuple(nombre for nombre, valor in campos.items() if valor is None)


def decidir_candidato(c: Candidato, r: Restricciones) -> Veredicto:
    """Descartado (con cifra), pendiente (faltan cifras: no se asume nada) o elegible."""
    descarte = descartar_por_restriccion(c, r)
    if descarte is not None:
        return Veredicto(c.id, "descartado", descarte, ())
    pendientes = _cifras_pendientes(c)
    if pendientes:
        return Veredicto(c.id, "pendiente", None, pendientes)
    return Veredicto(c.id, "elegible", None, ())


def desempatar_por_memoria(empatados: Sequence[Candidato]) -> Candidato:
    """Gana el de menor memoria residente del LLM (US-012 AC-4); a igualdad, el de menor p95 y luego el id."""
    return min(
        empatados,
        key=lambda c: (c.memoria_llm_gb or 0.0, c.e2e_p95_ms or 0.0, c.id),
    )


def elegir_candidato(
    candidatos: Sequence[Candidato],
    r: Restricciones,
    muestra_fidelidad: int,
    licencias_aceptadas: frozenset[str] = frozenset(),
) -> Decision:
    """Aplica D3: eliminatorias, empate por una salida de la muestra y sensibilidad de margen.

    Un candidato con licencia condicionada (HAI-DEF) solo entra a la elección si el usuario la aceptó por escrito
    (``licencias_aceptadas``). Un modelo más grande no gana por serlo. Si nadie queda elegible y nada está pendiente,
    se escala al usuario (US-012 AC-5) sin elegir uno que incumpla.
    """
    veredictos = tuple(decidir_candidato(c, r) for c in candidatos)
    elegibles = [
        c
        for c, v in zip(candidatos, veredictos, strict=True)
        if v.estado == "elegible" and _licencia_utilizable(c, r, licencias_aceptadas)
    ]
    hay_pendientes = any(v.estado == "pendiente" for v in veredictos)
    if not elegibles:
        return Decision(None, False, veredictos, (), None, not hay_pendientes)
    mejor = max(c.fidelidad or 0.0 for c in elegibles)
    paso = 1.0 / muestra_fidelidad
    empatados = [c for c in elegibles if round(mejor - (c.fidelidad or 0.0), 9) <= paso]
    elegido = desempatar_por_memoria(empatados)
    riesgo = _riesgo_de_margen(elegido, r)
    respaldo = _respaldo_con_margen(elegido, elegibles, r) if riesgo else None
    return Decision(elegido, len(empatados) > 1, veredictos, riesgo, respaldo, False)


def _licencia_utilizable(c: Candidato, r: Restricciones, aceptadas: frozenset[str]) -> bool:
    return c.licencia in r.licencias_academicas or c.licencia in aceptadas


def _riesgo_de_margen(c: Candidato, r: Restricciones) -> tuple[str, ...]:
    riesgos = []
    if (
        c.memoria_llm_gb is not None
        and r.llm_memory_budget_gb - c.memoria_llm_gb < r.margen_de_seguridad_gb
    ):
        riesgos.append("memoria_llm")
    if (
        c.memoria_stack_gb is not None
        and r.stack_memory_limit_gb - c.memoria_stack_gb < r.margen_de_seguridad_gb
    ):
        riesgos.append("memoria_stack")
    return tuple(riesgos)


def _respaldo_con_margen(
    elegido: Candidato, elegibles: Sequence[Candidato], r: Restricciones
) -> Candidato | None:
    otros = [c for c in elegibles if c.id != elegido.id and not _riesgo_de_margen(c, r)]
    if not otros:
        return None
    return max(otros, key=lambda c: (c.fidelidad or 0.0, -(c.memoria_llm_gb or 0.0)))


def validar_contra_esquema(salida: str, esquema: Mapping[str, Any]) -> bool:
    """``True`` si ``salida`` es JSON y cumple el esquema (el de la salida del LLM del S1). Nunca lanza."""
    try:
        jsonschema.validate(json.loads(salida), dict(esquema))
    except (ValueError, TypeError, jsonschema.ValidationError, jsonschema.SchemaError):
        return False
    return True


def porcentaje_json_valido(salidas: Sequence[str | None], esquema: Mapping[str, Any]) -> float:
    """Fracción de salidas válidas; una llamada sin salida (``None``: error o plazo agotado) cuenta como inválida."""
    if not salidas:
        raise ValueError("no hay salidas que validar")
    validas = sum(1 for s in salidas if s is not None and validar_contra_esquema(s, esquema))
    return validas / len(salidas)
