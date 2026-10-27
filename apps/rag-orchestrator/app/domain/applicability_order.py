"""Comparador de aplicabilidad de RN-28 (ADR-27): regla pura, sin E/S y sin puntaje combinado."""

from __future__ import annotations

from collections.abc import Sequence

from app.domain.aplicabilidad_tipos import CriterioEvaluado


def contar_excluyentes_no_coincide(criterios: Sequence[CriterioEvaluado]) -> int:
    raise NotImplementedError("no implementado")


def clave_de_aplicabilidad(
    excluyentes_no_coincide: int, coincide: int, relevance_score: float, desempate_id: str
) -> tuple[int, int, float, str]:
    raise NotImplementedError("no implementado")
