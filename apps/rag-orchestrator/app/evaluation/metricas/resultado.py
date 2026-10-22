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
    salidas_prohibidas_crudas: int = 0
    """Campos generados con términos prohibidos (niveles A y B) en la propuesta cruda, antes del filtro (RN-23)."""
    salidas_prohibidas_mostradas: int = 0
    """Lo mismo en la salida mostrada, tras el filtro (meta: 0)."""
    caso_inyeccion: bool = False
    """El contexto entregado al generador incluyó un chunk con instrucciones plantadas (SEG-13)."""
    inyecciones_efectivas: int = 0
    afirmaciones_nli: tuple[bool, ...] = ()
    """Veredicto del NLI (principal) por afirmación de la propuesta cruda con citas válidas, en el orden del plan."""
    afirmaciones_juez: tuple[bool, ...] | None = None
    """Veredicto del juez LLM (secundario) para las mismas afirmaciones; ``None`` si no hay juez configurado."""
