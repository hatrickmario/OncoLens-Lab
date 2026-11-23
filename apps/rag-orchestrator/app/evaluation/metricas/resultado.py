"""Lo que la suite conserva de cada consulta: solo números y banderas, nunca el texto de la pregunta ni de la salida."""

from __future__ import annotations

from dataclasses import dataclass

from app.evaluation.retrieval_metrics import ResultadoPregunta


@dataclass(frozen=True)
class LenguajeCrudo:
    """RN-23 en la propuesta cruda del generador, por nivel de la lista y frente al corpus citado (ARR-03 AC-3, AC-4).

    Solo ids de regla y conteos: nunca el texto generado ni el del corpus (RN-14).
    """

    campos_nivel_a: int = 0
    campos_nivel_b: int = 0
    campos_con_termino: int = 0
    """Campos con algún término de nivel A o B (un campo con ambos cuenta una vez)."""
    reproducen_corpus: int = 0
    """Campos generados con un término de la lista que el corpus citado por la propuesta también trae."""
    ids_nivel_a: frozenset[str] = frozenset()
    ids_nivel_b: frozenset[str] = frozenset()
    opciones: int = 0
    opciones_con_formula: int = 0
    """Opciones cuya justificación abre con «La fuente [cita] describe que…» (atribución a la fuente)."""


@dataclass(frozen=True)
class RechazoDeSalidaLegitima:
    """Las reglas que el filtro vigente y el de la línea base 1.5.0 aplican a la propuesta de una pregunta de control legítimo."""

    reglas_vigentes: tuple[str, ...] = ()
    reglas_de_la_linea_base: tuple[str, ...] = ()


@dataclass(frozen=True)
class ResultadoNoInferencia:
    """Lo que el juez acotado dijo de una consulta con datos críticos faltantes declarados (US-116 AC-1, FR-23).

    Solo conteos: nunca el texto de la salida ni el del dato (RN-14)."""

    caso: str
    """Id de la pregunta del dataset: lo único que el reporte nombra."""
    inferencias: int = 0
    """Pares (texto mostrado, dato faltante) en los que el juez vio un valor atribuido al dato."""
    veredictos_invalidos: int = 0
    """Veredictos del juez que no se pudieron interpretar: no cuentan como «sin inferencia»."""


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
    salidas_mostradas_nivel_a: int = 0
    """Campos de la salida mostrada con algún término de nivel A (bloqueante: meta 0)."""
    salidas_mostradas_nivel_b: int = 0
    """Campos de la salida mostrada con algún término de nivel B (bloqueante: meta 0, US-249 AC-4)."""
    campos_mostrados: tuple[tuple[str, str], ...] = ()
    """(campo, id de regla) de cada término de la salida mostrada; nunca el texto (RN-14)."""
    corregidas_nivel_a: int = 0
    """Campos de la propuesta cruda con término de nivel A (política de salida) que el filtro retiró de lo mostrado."""
    corregidas_nivel_b: int = 0
    """Lo mismo con el subconjunto de nivel B de ``salidaGenerada`` (US-249 AC-4)."""
    salida_legitima: RechazoDeSalidaLegitima | None = None
    """``None`` = la pregunta no es un control legítimo; si lo es, qué reglas le aplica cada filtro (US-249 AC-5)."""
    lenguaje_crudo: LenguajeCrudo = LenguajeCrudo()
    caso_inyeccion: bool = False
    """El contexto entregado al generador incluyó un chunk con instrucciones plantadas (SEG-13)."""
    inyecciones_efectivas: int = 0
    afirmaciones_nli: tuple[bool, ...] = ()
    """Veredicto del NLI (principal) por afirmación de la propuesta cruda con citas válidas, en el orden del plan."""
    ids_afirmaciones: tuple[str, ...] = ()
    """Id de cada afirmación (``<pregunta>/a<n>``, mismo orden que ``afirmaciones_nli``): las discrepancias se listan por id."""
    veredictos_invalidos_juez: int = 0
    """Veredictos del juez LLM que no se pudieron interpretar o citaron un fragmento inexistente (cuentan no soportados)."""
    afirmaciones_juez: tuple[bool, ...] | None = None
    """Veredicto del juez LLM (secundario) para las mismas afirmaciones; ``None`` si no hay juez configurado."""
    salida_invalida: tuple[str, ...] | None = None
    """``None`` = el generador devolvió una salida válida; si no, el id de cada regla que incumplió (nunca el texto, RN-14)."""
    no_inferencia: ResultadoNoInferencia | None = None
    """``None`` = la consulta no declara datos faltantes o no hay juez: no entra en la métrica de no inferencia."""
