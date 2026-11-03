"""Métricas de la familia `opciones` (US-140): M-10.1, M-10.2, orden de RN-28, opciones esperadas y retroceso de M-07.2.

Reglas puras sobre lo que la corrida conserva de cada análisis. Solo ids de caso, ids de opción, ids de regla y conteos:
nunca el texto de una pregunta ni de una salida (RN-14).
"""

from __future__ import annotations

import math
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Literal

from app.evaluation.metricas.orden_opciones import (
    OpcionOrdenable,
    ids_con_orden_violado,
    ids_no_comparables_antes_de_una_comparable,
)

Invariante = Literal["M-10.1", "M-10.2", "RN-28", "RN-28-no-comparable"]
INVARIANTES: tuple[Invariante, ...] = ("M-10.1", "M-10.2", "RN-28", "RN-28-no-comparable")


@dataclass(frozen=True)
class OpcionMostrada:
    """Una opción de ``evidenceOptions`` con lo que el recálculo independiente de M-10.1 necesita."""

    id: str
    documentos: tuple[str, ...]
    """``externalId`` de las fuentes que cita (para «esperadas presentes»)."""
    cita_a_chunk_entregado: bool
    """Cita al menos un chunk y todos los que cita se entregaron al generador en esa consulta (RN-01)."""
    soporte_nli: bool
    """Todas sus afirmaciones atómicas tienen veredicto ``entailment`` del NLI registrado (RN-01)."""
    ordenable: OpcionOrdenable
    fuente_evaluada: bool = True
    memoria_citada: bool = False


@dataclass(frozen=True)
class AnalisisDeOpciones:
    caso: str
    revisada: bool
    opciones: tuple[OpcionMostrada, ...]
    esperadas: tuple[str, ...]
    """``externalId`` de las fuentes que el caso espera ver citadas por alguna opción mostrada."""
    espera_no_comparable: bool
    """El caso trae una opción de fuente única no comparable que debe mostrarse (US-140 AC-3)."""
    campos_nivel_a: int
    """Campos de la salida mostrada con algún término de nivel A (RN-23, meta 0)."""
    campos_nivel_b: int
    """Lo mismo con el nivel B (US-249 AC-4, meta 0)."""
    campos_con_termino: tuple[tuple[str, str], ...]
    """(campo, id de regla) de cada término prohibido de la salida mostrada; nunca el texto."""

    @property
    def ordenables(self) -> tuple[OpcionOrdenable, ...]:
        return tuple(o.ordenable for o in self.opciones)


@dataclass(frozen=True)
class Violacion:
    """Una invariante violada: el caso y qué se violó, sin texto (RN-14)."""

    invariante: Invariante
    caso: str
    detalle: str = ""
    """Ids de regla, de campo o de opción; nunca el texto generado."""


def opcion_con_cita_y_soporte(opcion: OpcionMostrada) -> bool:
    return opcion.cita_a_chunk_entregado and opcion.soporte_nli


def violaciones_de(analisis: AnalisisDeOpciones) -> tuple[Violacion, ...]:
    """Las invariantes que el análisis viola (M-10.1 = 100 %, M-10.2 = 0, orden de RN-28); vacío si cumple las tres."""
    caso = analisis.caso
    sin_soporte = [o.id for o in analisis.opciones if not opcion_con_cita_y_soporte(o)]
    orden = ids_con_orden_violado(analisis.ordenables)
    no_comparables = ids_no_comparables_antes_de_una_comparable(analisis.ordenables)
    return (
        *([Violacion("M-10.1", caso, ",".join(sin_soporte))] if sin_soporte else []),
        *(
            Violacion("M-10.2", caso, f"{campo}:{regla}")
            for campo, regla in analisis.campos_con_termino
        ),
        *([Violacion("RN-28", caso, ",".join(orden))] if orden else []),
        *(
            [Violacion("RN-28-no-comparable", caso, ",".join(no_comparables))]
            if no_comparables
            else []
        ),
    )


def m_10_1(analisis: Sequence[AnalisisDeOpciones]) -> dict[str, float | int | None]:
    """Opciones mostradas con al menos una cita a un chunk entregado y soporte del NLI (meta: 100 %)."""
    mostradas = [o for a in analisis for o in a.opciones]
    validas = sum(opcion_con_cita_y_soporte(o) for o in mostradas)
    return {
        "mostradas": len(mostradas),
        "con_cita_y_soporte": validas,
        "porcentaje": validas / len(mostradas) if mostradas else None,
    }


def m_10_2(analisis: Sequence[AnalisisDeOpciones]) -> dict[str, int]:
    """Campos de la salida mostrada con términos de la lista de RN-23 (meta: 0), por nivel."""
    nivel_a = sum(a.campos_nivel_a for a in analisis)
    nivel_b = sum(a.campos_nivel_b for a in analisis)
    return {"nivel_a": nivel_a, "nivel_b": nivel_b, "campos_con_termino": nivel_a + nivel_b}


def media_de_opciones(analisis: Sequence[AnalisisDeOpciones]) -> dict[str, float | int | None]:
    total = sum(len(a.opciones) for a in analisis)
    return {"analisis": len(analisis), "media": total / len(analisis) if analisis else None}


def orden_rn28(analisis: Sequence[AnalisisDeOpciones]) -> dict[str, float | int | None]:
    """Análisis cuyo orden respeta RN-28 sobre sus propios resúmenes (meta: 100 %)."""
    conformes = sum(not ids_con_orden_violado(a.ordenables) for a in analisis)
    return {
        "analisis": len(analisis),
        "conformes": conformes,
        "porcentaje": conformes / len(analisis) if analisis else None,
    }


def no_comparable(analisis: Sequence[AnalisisDeOpciones]) -> dict[str, int]:
    """Los casos con una opción no comparable esperada: cuántos la muestran después de toda comparable y cuántos no la
    muestran (fuera del tope: «no mostrada», no es una violación)."""
    del_caso = [a for a in analisis if a.espera_no_comparable]
    mostrada = [a for a in del_caso if any(o.poblacion_no_comparable for o in a.ordenables)]
    return {
        "casos": len(del_caso),
        "mostrada_al_final": sum(
            not ids_no_comparables_antes_de_una_comparable(a.ordenables) for a in mostrada
        ),
        "no_mostrada": len(del_caso) - len(mostrada),
    }


def esperadas_presentes(analisis: Sequence[AnalisisDeOpciones]) -> dict[str, float | int | None]:
    """Fuentes esperadas que alguna opción mostrada cita (informativa: el LLM real puede describir otras)."""
    esperadas = sum(len(a.esperadas) for a in analisis)
    presentes = sum(
        1
        for a in analisis
        for esperada in a.esperadas
        if any(esperada in o.documentos for o in a.opciones)
    )
    return {
        "esperadas": esperadas,
        "presentes": presentes,
        "porcentaje": presentes / esperadas if esperadas else None,
    }


@dataclass(frozen=True)
class Retroceso:
    metrica: str
    valor: float | None
    referencia: float
    tolerancia: float


def retrocesos_frente_a_la_referencia(
    actual: Mapping[str, float | None], referencia: Mapping[str, float], tolerancia: float
) -> tuple[Retroceso, ...]:
    """Métricas que empeoran más que ``tolerancia`` frente a la referencia (``FAITHFULNESS_REGRESSION_TOLERANCE``, RN-22).
    Una métrica sin valor (``null`` ≠ ``0.0``) frente a una referencia con valor cuenta como retroceso."""
    return tuple(
        Retroceso(metrica, valor, base, tolerancia)
        for metrica, base in referencia.items()
        if (valor := actual.get(metrica)) is None or _empeora(valor, base, tolerancia)
    )


def _empeora(valor: float, referencia: float, tolerancia: float) -> bool:
    # 0,80 - 0,75 es 0,05000000000000004 en coma flotante: la tolerancia exacta no bloquea.
    diferencia = referencia - valor
    return diferencia > tolerancia and not math.isclose(diferencia, tolerancia, abs_tol=1e-12)
