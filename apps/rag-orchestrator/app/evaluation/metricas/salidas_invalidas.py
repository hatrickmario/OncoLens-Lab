"""Salidas inválidas del LLM (D5-06, D5-28): preguntas cuya generación falló la validación del esquema interno.

Una salida inválida no aborta la suite: la pregunta cuenta como fallida, con su id y el id de cada regla incumplida
(``principal_duplicada``, ``principal_ausente``…), nunca el texto generado ni el de la pregunta (RN-14).
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from app.evaluation.metricas.resultado import ResultadoConsulta

CODIGO_SALIDAS_INVALIDAS = 5


def salidas_invalidas(resultados: Sequence[ResultadoConsulta]) -> dict[str, Any] | None:
    """``{casos, preguntas: [{caso, reglas}]}``; ``None`` (sin sección en el reporte) si no hubo ninguna."""
    preguntas = [
        {"caso": r.recuperacion.id, "reglas": list(r.salida_invalida)}
        for r in resultados
        if r.salida_invalida is not None
    ]
    return {"casos": len(preguntas), "preguntas": preguntas} if preguntas else None


def avisar_de_las_salidas_invalidas(invalidas: dict[str, Any]) -> str:
    """El aviso de ``stderr``: solo ids de pregunta y de regla."""
    casos = ", ".join(f"{p['caso']}:{'+'.join(p['reglas'])}" for p in invalidas["preguntas"])
    return f"evaluate: {invalidas['casos']} salida(s) inválida(s) del LLM contadas como fallidas: {casos}"
