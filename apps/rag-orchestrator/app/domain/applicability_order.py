"""Comparador de aplicabilidad de RN-28 (ADR-27): regla pura, sin E/S y sin puntaje combinado."""

from __future__ import annotations

from collections.abc import Sequence

from app.domain.aplicabilidad_tipos import CriterioEvaluado


def contar_excluyentes_no_coincide(criterios: Sequence[CriterioEvaluado]) -> int:
    """Criterios excluyentes en ``no_coincide``: no es ``summary.noCoincide``, que cuenta también los no excluyentes."""
    return sum(1 for c in criterios if c.es_excluyente and c.estado == "no_coincide")


def clave_de_aplicabilidad(
    excluyentes_no_coincide: int, coincide: int, relevance_score: float, desempate_id: str
) -> tuple[int, int, float, str]:
    """Clave de orden ascendente (la menor es la más aplicable): menos excluyentes en No coincide, más Coincide, mayor
    relevancia (RN-03) y menor identificador. Es una tupla, nunca un puntaje: ``parcial`` y ``desconocido`` no ordenan."""
    return (excluyentes_no_coincide, -coincide, -relevance_score, desempate_id)
