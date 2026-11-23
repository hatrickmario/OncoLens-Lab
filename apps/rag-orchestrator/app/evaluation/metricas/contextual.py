"""Reglas puras de la familia `contextual` (US-271 AC-9, L1D-329): sin E/S, probadas con datos de dominio.

La causa de una pregunta de sinónimos que no supera el umbral y los recuentos por clase. Solo ids, estados y recuentos:
nunca el texto de una pregunta, de un chunk ni de un término del caso (RN-14).
"""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from typing import Final

from app.domain.lenguaje import normalizar_texto
from app.schemas.generated.models import RagQueryStatus

ESTADO_CON_EVIDENCIA: Final = RagQueryStatus.con_evidencia.value
ESTADO_SIN_EVIDENCIA: Final = RagQueryStatus.sin_evidencia.value
ESTADO_SALIDA_INVALIDA: Final = "salida_invalida"
ESTADOS_DE_FILA: Final = (ESTADO_CON_EVIDENCIA, ESTADO_SIN_EVIDENCIA, ESTADO_SALIDA_INVALIDA)
CAUSA_TERMINO_AUSENTE: Final = "termino_ausente_del_corpus"
CAUSA_BAJO_UMBRAL: Final = "bajo_umbral_con_termino_en_corpus"
CAUSAS_DE_SINONIMO: Final = (CAUSA_TERMINO_AUSENTE, CAUSA_BAJO_UMBRAL)
CLASE_GENERICA: Final = "generica"
CLASE_CON_TEMA: Final = "con_tema"
CLASE_CONTROL: Final = "control"
CLASES_DE_PREGUNTA: Final = (CLASE_GENERICA, CLASE_CON_TEMA, CLASE_CONTROL)
SEGUNDO_LOOP_CONTEXTUAL: Final = "contextual"
SEGUNDO_LOOP_NINGUNO: Final = "ninguno"
AMBITO_TOTAL: Final = "total"
METRICA_GENERICAS: Final = "genericas_con_evidencia"
METRICA_CONTROLES: Final = "controles_con_evidencia"
METRICA_FALSOS_POSITIVOS: Final = "falsos_positivos"
METRICAS_FRENTE_A_LA_BASE: Final = (METRICA_GENERICAS, METRICA_CONTROLES, METRICA_FALSOS_POSITIVOS)

CONDICIONES_DE_LA_CAUSA: Final = (
    "algún chunk supera RELEVANCE_THRESHOLD",
    "ninguna forma del término (canónica o sinónimo, es o en, sin distinguir mayúsculas ni tildes) aparece en un chunk del corpus de la corrida recuperable para el tipo de cáncer del caso",
    "alguna forma del término aparece en un chunk del corpus y ningún chunk supera RELEVANCE_THRESHOLD",
)
REGLA_DE_LA_CAUSA: Final = tuple(
    zip(
        range(1, 4),
        CONDICIONES_DE_LA_CAUSA,
        (None, CAUSA_TERMINO_AUSENTE, CAUSA_BAJO_UMBRAL),
        strict=True,
    )
)
"""La regla de ``causa_de_sinonimo`` tal como la escribe el informe: (orden, condición, causa); la primera que se cumple manda."""


@dataclass(frozen=True)
class ChunkPuntuado:
    """Un chunk del ranking final de una pregunta: su id y su ``relevance_score`` en [0, 1] (RN-03); nunca su texto."""

    chunk_id: str
    relevance_score: float


@dataclass(frozen=True)
class FilaContextual:
    """Una pregunta corrida con un caso. ``None`` = no observado (≠ ``0.0``)."""

    pregunta_id: str
    clase: str
    caso: str
    estado: str
    """``con_evidencia`` = superó el umbral y el generador devolvió una salida válida (en `diagnostico`, «con evidencia»
    significa opciones mostradas). ``salida_invalida`` también superó el umbral (``supero_umbral``)."""
    supero_umbral: bool
    top_relevance_score: float | None
    segundo_loop: str | None
    top3: tuple[ChunkPuntuado, ...] = ()
    """Los tres primeros chunks del último ranking de la pregunta; vacío si el *reranker* no puntuó nada."""
    campos_usados: tuple[str, ...] = ()
    """``contextExpansion.fields`` de la respuesta; vacío si no hubo segundo loop contextual."""
    llamadas_al_generador: int = 0
    """Veces que se invocó al LLM de generación para esta consulta (RN-02: 0 cuando no hay chunks sobre el umbral)."""


@dataclass(frozen=True)
class RecuentoDeClase:
    ambito: str
    """``total`` o el id del caso."""
    clase: str
    con_evidencia: int
    total: int
    superaron_umbral: int
    """Preguntas que superaron el umbral, con salida válida o no: es la medida del falso positivo de las adversarias."""


def causa_de_sinonimo(
    supero_umbral: bool, formas: Sequence[str], textos_de_chunks: Iterable[str]
) -> str | None:
    """Por qué una pregunta de sinónimos no supera el umbral (design D4): ``None`` si lo supera; ``termino_ausente_del_corpus``
    si ninguna forma del término (canónica o sinónimo, en cualquier idioma) aparece en un chunk recuperable para el caso
    (quien llama pasa solo los chunks del tipo de cáncer del caso: la recuperación filtra por él);
    ``bajo_umbral_con_termino_en_corpus`` si alguna aparece y aun así no supera el umbral (el detalle por etapa es de
    ``diagnostico``). La comparación no distingue mayúsculas, tildes ni signos y exige palabras completas."""
    if supero_umbral:
        return None
    if _alguna_forma_aparece(formas, textos_de_chunks):
        return CAUSA_BAJO_UMBRAL
    return CAUSA_TERMINO_AUSENTE


def _alguna_forma_aparece(formas: Sequence[str], textos_de_chunks: Iterable[str]) -> bool:
    normalizadas = [f" {forma} " for forma in map(normalizar_texto, formas) if forma]
    return any(
        forma in f" {normalizar_texto(texto)} "
        for texto in textos_de_chunks
        for forma in normalizadas
    )


def recuentos_por_clase(filas: Sequence[FilaContextual]) -> tuple[RecuentoDeClase, ...]:
    """Por ámbito (el total y luego cada caso, en el orden en que aparecen) y por clase: cuántas preguntas terminaron
    ``con_evidencia`` y cuántas se corrieron. Una clase sin preguntas lleva ``total`` 0: no se omite (AC-2, AC-4)."""
    casos = list(dict.fromkeys(f.caso for f in filas))
    return tuple(
        _recuento(ambito, clase, [f for f in filas if ambito == AMBITO_TOTAL or f.caso == ambito])
        for ambito in (AMBITO_TOTAL, *casos)
        for clase in CLASES_DE_PREGUNTA
    )


def _recuento(ambito: str, clase: str, filas: Sequence[FilaContextual]) -> RecuentoDeClase:
    de_la_clase = [f for f in filas if f.clase == clase]
    con_evidencia = sum(f.estado == ESTADO_CON_EVIDENCIA for f in de_la_clase)
    superaron = sum(f.supero_umbral for f in de_la_clase)
    return RecuentoDeClase(ambito, clase, con_evidencia, len(de_la_clase), superaron)


def es_falso_positivo(fila: FilaContextual) -> bool:
    """Una adversaria (tema fuera del corpus) que superó el umbral: la definición única del falso positivo (RN-02)."""
    return fila.clase == CLASE_CON_TEMA and fila.supero_umbral


@dataclass(frozen=True)
class CoberturaDeCaso:
    caso: str
    genericas_con_evidencia: int
    genericas_total: int
    minimo: int
    """La meta leída de la configuración (RN-22); nunca una constante de este módulo."""
    cumple: bool
    campos_usados: tuple[str, ...]


@dataclass(frozen=True)
class AdversariasDeCaso:
    caso: str
    total: int
    sin_evidencia: int
    falsos_positivos: int
    con_puntaje_nulo: int
    llamadas_al_generador: int


@dataclass(frozen=True)
class CambioFrenteALaBase:
    ambito: str
    metrica: str
    base: int
    actual: int
    empeora: bool


def genericas_con_evidencia_por_caso(
    filas: Sequence[FilaContextual], minimo: int
) -> tuple[CoberturaDeCaso, ...]:
    """Por caso, en el orden en que aparecen: cuántas genéricas terminaron ``con_evidencia`` (el estado lo dio el servicio: no
    se vuelve a aplicar el umbral), cuántas se corrieron, la meta y si se cumple (``>=``), con los campos usados."""
    por_caso = {
        caso: [f for f in filas if f.caso == caso] for caso in dict.fromkeys(f.caso for f in filas)
    }
    return tuple(_cobertura(caso, de_el_caso, minimo) for caso, de_el_caso in por_caso.items())


def _cobertura(caso: str, filas: Sequence[FilaContextual], minimo: int) -> CoberturaDeCaso:
    genericas = [f for f in filas if f.clase == CLASE_GENERICA]
    con_evidencia = sum(f.estado == ESTADO_CON_EVIDENCIA for f in genericas)
    return CoberturaDeCaso(
        caso,
        con_evidencia,
        len(genericas),
        minimo,
        con_evidencia >= minimo,
        next((f.campos_usados for f in genericas if f.campos_usados), ()),
    )


def adversarias_por_caso(filas: Sequence[FilaContextual]) -> tuple[AdversariasDeCaso, ...]:
    """Por caso: las preguntas con tema fuera del corpus (``con_tema``) que quedaron ``sin_evidencia``, las que no (falsos
    positivos), las que dejaron el puntaje en ``null`` y cuántas veces se invocó al generador (RN-02: debe ser 0)."""
    casos = dict.fromkeys(f.caso for f in filas)
    return tuple(_adversarias(caso, [f for f in filas if f.caso == caso]) for caso in casos)


def _adversarias(caso: str, filas: Sequence[FilaContextual]) -> AdversariasDeCaso:
    adversarias = [f for f in filas if f.clase == CLASE_CON_TEMA]
    return AdversariasDeCaso(
        caso,
        len(adversarias),
        sum(f.estado == ESTADO_SIN_EVIDENCIA for f in adversarias),
        sum(es_falso_positivo(f) for f in adversarias),
        sum(f.top_relevance_score is None for f in adversarias),
        sum(f.llamadas_al_generador for f in adversarias),
    )


def comparar_con_base(
    actual: Sequence[RecuentoDeClase], base: Sequence[RecuentoDeClase]
) -> tuple[CambioFrenteALaBase, ...]:
    """Por ámbito presente en las dos corridas (el total y cada caso): genéricas con evidencia, controles con evidencia y
    falsos positivos (``con_tema`` con evidencia). Una métrica empeora cuando baja una cobertura o sube un falso positivo."""
    ambitos_de_la_base = {r.ambito for r in base}
    comunes = [a for a in dict.fromkeys(r.ambito for r in actual) if a in ambitos_de_la_base]
    return tuple(
        _cambio(ambito, metrica, _valor(actual, ambito, *medida), _valor(base, ambito, *medida))
        for ambito in comunes
        for metrica, medida in _MEDIDA_DE_LA_METRICA
    )


_MEDIDA_DE_LA_METRICA: Final = (
    (METRICA_GENERICAS, (CLASE_GENERICA, "con_evidencia")),
    (METRICA_CONTROLES, (CLASE_CONTROL, "con_evidencia")),
    (METRICA_FALSOS_POSITIVOS, (CLASE_CON_TEMA, "superaron_umbral")),
)
"""Por métrica: la clase de pregunta y el recuento que se compara. El falso positivo cuenta las que superaron el umbral."""


def _valor(recuentos: Sequence[RecuentoDeClase], ambito: str, clase: str, campo: str) -> int:
    """El recuento pedido; si la pareja ámbito-clase falta es un error, nunca un 0 (``null`` ≠ ``0``)."""
    recuento = next(r for r in recuentos if (r.ambito, r.clase) == (ambito, clase))
    return int(getattr(recuento, campo))


def _cambio(ambito: str, metrica: str, actual: int, base: int) -> CambioFrenteALaBase:
    empeora = actual > base if metrica == METRICA_FALSOS_POSITIVOS else actual < base
    return CambioFrenteALaBase(ambito, metrica, base, actual, empeora)
