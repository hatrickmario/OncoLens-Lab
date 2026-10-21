"""Lo que la suite conserva de cada consulta: solo números y banderas, nunca el texto de la pregunta ni de la salida."""

from __future__ import annotations

from dataclasses import dataclass

from app.evaluation.retrieval_metrics import ResultadoPregunta


@dataclass(frozen=True)
class ResultadoConsulta:
    recuperacion: ResultadoPregunta
    revisada: bool
    esperaba_sin_evidencia: bool
    sin_evidencia: bool
    generador_invocado: bool
    top_relevance_score: float | None
    citas_propuestas: int
    citas_validas: int
    opciones_mostradas: int
    opciones_descartadas: int
