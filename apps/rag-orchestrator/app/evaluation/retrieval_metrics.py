"""Regla de acierto y métricas de recuperación de ADR-39 (recall@10, MRR, bootstrap). Funciones puras.

Acierto (manifiesto del dataset): un chunk acierta si pertenece al documento esperado y contiene la
``cita`` (normalizando espacios y puntuación). La etiqueta es por pasaje, no por chunk, para que el
resultado no dependa del *chunking* que se compara.
"""

from __future__ import annotations

import random
import re
import unicodedata
from collections import defaultdict
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from statistics import mean

from app.evaluation.dataset_loader import Pregunta

K = 10
_NO_ALFANUMERICO = re.compile(r"[\W_]+", re.UNICODE)


def normalizar_texto(texto: str) -> str:
    """Quita puntuación y colapsa espacios (NFKC); no cambia mayúsculas."""
    return _NO_ALFANUMERICO.sub(" ", unicodedata.normalize("NFKC", texto)).strip()


def contiene_cita(texto: str, cita: str) -> bool:
    return normalizar_texto(cita) in normalizar_texto(texto)


@dataclass(frozen=True)
class ChunkRecuperado:
    """Un chunk del ranking con su documento y puntaje; ``texto`` solo vive en memoria."""

    documento: str
    texto: str
    puntaje: float


@dataclass(frozen=True)
class ResultadoPregunta:
    id: str
    modo: str
    idioma: str
    es_es_en: bool
    es_control: bool
    cancer: str
    tipo: str
    documentos: tuple[str, ...]
    recall: float | None  # None en sin_evidencia: ni acierto ni fallo
    rr: float | None
    puntaje_maximo: float | None  # solo se informa en sin_evidencia


def acierta(chunk: ChunkRecuperado, pregunta: Pregunta) -> bool:
    return any(chunk.documento == e.documento and contiene_cita(chunk.texto, e.cita) for e in pregunta.evidencia)


def evaluar_pregunta(pregunta: Pregunta, ranking: Sequence[ChunkRecuperado], k: int = K) -> ResultadoPregunta:
    """Evalúa un ranking (ya ordenado) según el ``modo_acierto`` de la pregunta."""
    top = list(ranking[:k])
    base = {
        "id": pregunta.id,
        "modo": pregunta.modo_acierto,
        "idioma": pregunta.idioma,
        "es_es_en": pregunta.es_espanol_contra_ingles,
        "es_control": pregunta.es_control_ingles,
        "cancer": pregunta.cancer,
        "tipo": pregunta.tipo,
        "documentos": pregunta.documentos,
    }
    if pregunta.modo_acierto == "sin_evidencia":
        maximo = max((c.puntaje for c in ranking), default=None)
        return ResultadoPregunta(**base, recall=None, rr=None, puntaje_maximo=maximo)

    posicion = next((i for i, c in enumerate(top, start=1) if acierta(c, pregunta)), None)
    rr = 1.0 / posicion if posicion else 0.0
    if pregunta.modo_acierto == "cobertura_documentos":
        esperados = {e.documento for e in pregunta.evidencia}
        cubiertos = {
            e.documento for e in pregunta.evidencia for c in top if c.documento == e.documento and contiene_cita(c.texto, e.cita)
        }
        recall = len(cubiertos) / len(esperados)
    else:
        recall = 1.0 if posicion else 0.0
    return ResultadoPregunta(**base, recall=recall, rr=rr, puntaje_maximo=None)


@dataclass(frozen=True)
class Metrica:
    recall_at_10: float
    mrr: float
    n: int
    recall_ic95: tuple[float, float]
    mrr_ic95: tuple[float, float]


def _bootstrap_ic(valores: Sequence[float], semilla: int, repeticiones: int, alfa: float = 0.05) -> tuple[float, float]:
    if not valores:
        return (float("nan"), float("nan"))
    rng = random.Random(semilla)
    n = len(valores)
    medias = sorted(mean(rng.choices(valores, k=n)) for _ in range(repeticiones))
    inferior = medias[int((alfa / 2) * (repeticiones - 1))]
    superior = medias[int((1 - alfa / 2) * (repeticiones - 1))]
    return (inferior, superior)


def metrica(resultados: Sequence[ResultadoPregunta], semilla: int, repeticiones: int = 1000) -> Metrica:
    """recall@10 y MRR medios con IC 95 % por bootstrap sobre las preguntas (semilla de configuración)."""
    con_respuesta = [r for r in resultados if r.recall is not None and r.rr is not None]
    recalls = [r.recall for r in con_respuesta if r.recall is not None]
    rrs = [r.rr for r in con_respuesta if r.rr is not None]
    return Metrica(
        recall_at_10=mean(recalls) if recalls else float("nan"),
        mrr=mean(rrs) if rrs else float("nan"),
        n=len(con_respuesta),
        recall_ic95=_bootstrap_ic(recalls, semilla, repeticiones),
        mrr_ic95=_bootstrap_ic(rrs, semilla + 1, repeticiones),
    )


def _desglose(
    resultados: Sequence[ResultadoPregunta], clave: Callable[[ResultadoPregunta], str | None], semilla: int, repeticiones: int
) -> dict[str, Metrica]:
    grupos: dict[str, list[ResultadoPregunta]] = defaultdict(list)
    for r in resultados:
        etiqueta = clave(r)
        if etiqueta is not None:
            grupos[etiqueta].append(r)
    return {k: metrica(v, semilla, repeticiones) for k, v in sorted(grupos.items())}


def agregar(resultados: Sequence[ResultadoPregunta], semilla: int, repeticiones: int = 1000) -> dict[str, object]:
    """Totales y desgloses por fuente, tipo de dato, idioma y controles, más el aparte de ``sin_evidencia``."""
    por_fuente: dict[str, list[ResultadoPregunta]] = defaultdict(list)
    for r in resultados:
        for doc in r.documentos:
            por_fuente[doc].append(r)
    sin_evidencia = [r.puntaje_maximo for r in resultados if r.modo == "sin_evidencia" and r.puntaje_maximo is not None]
    return {
        "total": metrica(resultados, semilla, repeticiones),
        "es_a_en": metrica([r for r in resultados if r.es_es_en], semilla, repeticiones),
        "controles_en": metrica([r for r in resultados if r.es_control], semilla, repeticiones),
        "por_fuente": {k: metrica(v, semilla, repeticiones) for k, v in sorted(por_fuente.items())},
        "por_tipo": _desglose(resultados, lambda r: r.tipo, semilla, repeticiones),
        "por_cancer": _desglose(resultados, lambda r: r.cancer, semilla, repeticiones),
        "por_idioma": _desglose(resultados, lambda r: r.idioma, semilla, repeticiones),
        "sin_evidencia_puntaje_maximo": {
            "n": len(sin_evidencia),
            "maximo": max(sin_evidencia) if sin_evidencia else None,
            "mediana": sorted(sin_evidencia)[len(sin_evidencia) // 2] if sin_evidencia else None,
        },
    }
