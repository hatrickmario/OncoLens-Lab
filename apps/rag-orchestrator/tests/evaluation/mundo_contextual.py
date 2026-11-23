"""Mundo de prueba de la familia `contextual` (US-271 AC-9): un corpus y unas preguntas sintéticas en un directorio temporal y
un *reranker* guionado que cumple el contrato del puerto real. Cada pregunta declara qué puntaje recibe su chunk en el primer
loop y en el loop contextual, así que cada fila del informe tiene un resultado conocido. Sin mocks de módulos propios."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

from app.application.ports import CandidatoParaReranker
from app.evaluation.corrida_contextual import PuertosDeContextual

PUNTAJE_BAJO = 0.05
CASOS = "packages/clinical-catalogs/test/fixtures/temas-del-caso.json"

# Las preguntas son las de la medición de ADR-52 (mismo texto): el gate «sin tema propio» las clasifica como en producción.
G01 = "¿Qué evidencia hay para este caso?"
A01 = "¿Qué evidencia hay sobre melanoma uveal metastásico?"
C12 = "¿Qué evidencia hay sobre antraciclinas en el tratamiento adyuvante del cáncer de mama?"
C13 = "¿Qué describe la evidencia sobre pertuzumab en cáncer de mama HER2 positivo?"
C14 = "¿Qué dice la evidencia sobre los TILs en cáncer de mama triple negativo?"
PREGUNTAS = (
    ("CTX-G01", "generica", G01),
    ("CTX-A01", "con_tema", A01),
    ("CTX-C12", "control", C12),
    ("CTX-C13", "control", C13),
    ("CTX-C14", "control", C14),
)
SINONIMOS = (("CTX-C12", "antraciclinas"), ("CTX-C13", "pertuzumab"), ("CTX-C14", "TILs"))

CHUNKS = {
    "c1": (
        "d1",
        "Las antraciclinas se describen en el tratamiento adyuvante del cancer de mama temprano.",
    ),
    # Solo trae una forma de ``sinonimos[]`` de TILs (no la canónica): la causa debe buscarla con todas sus formas.
    "c2": (
        "d2",
        "Los tumor-infiltrating lymphocytes se describen en el cancer de mama triple negativo.",
    ),
    "c3": ("d3", "Texto sintetico de relleno sin relacion con los temas de las preguntas."),
    "c4": (
        "d4",
        "Resumen sintetico de la evidencia disponible para un caso de cancer de mama en estadio IIA.",
    ),
}
TEXTOS_DEL_CASO = ("Receptor de estrógeno",)
"""Términos del caso ``mama-completo`` que el informe jamás debe contener."""


@dataclass(frozen=True)
class Guion:
    """El chunk que puntúa alto y cuánto: ``primero`` con la consulta original, ``ampliado`` con la contextual."""

    chunk: str
    primero: float
    ampliado: float


GUIONES = {
    G01: Guion("c4", PUNTAJE_BAJO, 0.9),
    C12: Guion("c1", 0.9, 0.9),
    C14: Guion("c2", 0.1, 0.1),
}


class RerankerGuionado:
    """``Reranker``: puntúa el chunk guionado de la pregunta; la consulta contextual empieza por la pregunta original y la
    amplía con términos. Nunca devuelve ``None``: un candidato sin guion recibe un puntaje bajo (``null`` ≠ ``0.0``)."""

    version = "fake-reranker-contextual@1"

    def __init__(self, guiones: dict[str, Guion]) -> None:
        self._guiones = guiones

    def puntuar(self, pregunta: str, candidatos: Sequence[CandidatoParaReranker]) -> list[float]:
        base = next(
            (p for p in sorted(self._guiones, key=len, reverse=True) if pregunta.startswith(p)),
            None,
        )
        if base is None:
            return [PUNTAJE_BAJO for _ in candidatos]
        guion = self._guiones[base]
        puntaje = guion.primero if pregunta == base else guion.ampliado
        return [puntaje if c.chunk_id == guion.chunk else PUNTAJE_BAJO for c in candidatos]


@dataclass(frozen=True)
class Mundo:
    config: Path
    corpus: Path
    puertos: PuertosDeContextual
    textos: tuple[str, ...]
    """Todo texto que el informe jamás debe contener: preguntas, chunks y términos del caso."""


def _yaml(ruta: Path, contenido: dict[str, Any]) -> None:
    ruta.write_text(
        yaml.safe_dump(contenido, allow_unicode=True, sort_keys=False), encoding="utf-8"
    )


def escribir_corpus(directorio: Path, clase: str = "sintetico") -> None:
    directorio.mkdir(parents=True)
    _yaml(
        directorio / "manifest.yaml",
        {
            "clase": clase,
            "nombre": "corpus-contextual-prueba",
            "version": "1",
            "archivos": {"preguntas_contextuales": "preguntas-contextuales.yaml"},
        },
    )
    _yaml(
        directorio / "corpus.yaml",
        {
            "clase": clase,
            "release": "rel-prueba-1",
            "corte": "2026-11-03",
            "documentos": [
                {"id": d, "titulo": f"Documento {d} (test)", "cancer": "mama"}
                for d, _ in CHUNKS.values()
            ],
            "chunks": [{"id": i, "documento": d, "texto": t} for i, (d, t) in CHUNKS.items()],
        },
    )
    _yaml(
        directorio / "preguntas.yaml",
        {
            "clase": clase,
            "preguntas": [
                {
                    "id": "Q0",
                    "idioma": "es",
                    "cancer": "mama",
                    "tipo": "hecho",
                    "modo_acierto": "cualquiera",
                    "pregunta": "Pregunta de relleno del corpus",
                    "evidencia": [{"documento": "d1", "cita": "antraciclinas se describen"}],
                }
            ],
        },
    )
    _yaml(directorio / "propuestas.yaml", {"clase": clase, "propuestas": {}})
    _yaml(directorio / "pii.yaml", {"clase": clase, "textos": []})
    _yaml(directorio / "prescriptivas.yaml", {"clase": clase, "salidas": []})
    _yaml(
        directorio / "preguntas-contextuales.yaml",
        {
            "clase": clase,
            "preguntas": [
                {"id": i, "clase": c, "idioma": "es", "genericas": c == "generica", "pregunta": t}
                for i, c, t in PREGUNTAS
            ],
        },
    )


def construir_mundo(
    tmp_path: Path,
    *,
    clase: str = "sintetico",
    expansion: bool = True,
    sinonimos: Sequence[tuple[str, str]] = SINONIMOS,
    casos: Sequence[str] = ("mama-completo",),
) -> Mundo:
    corpus = tmp_path / "corpus"
    escribir_corpus(corpus, clase)
    config = {
        "nombre": "contextual-prueba",
        "fixture": "CTX-PRUEBA",
        "dataset": {"ruta": str(corpus)},
        "semilla_bootstrap": 20261122,
        "bootstrap_repeticiones": 10,
        "medicion": {"reloj": "simulado"},
        "adaptadores": {"proveedor": "fake"},
        "modelos": {"llm": "fake-guion@1"},
        "umbrales": {
            "relevance_threshold": 0.30,
            "nli_entailment_threshold": 0.7,
            "retrieval_top_k": 30,
            "rerank_top_n": 10,
        },
        "catalogo": {"version": "2026.10.0", "ruta_terminos": "packages/clinical-catalogs"},
        "contextual": {
            "casos": list(casos),
            "casos_ruta": CASOS,
            "expansion_habilitada": expansion,
            "reranker_max_pairs": 20,
            "preguntas_de_sinonimos": [{"pregunta": p, "termino": t} for p, t in sinonimos],
        },
    }
    ruta = tmp_path / "config.yaml"
    _yaml(ruta, config)
    textos = (
        tuple(t for _, _, t in PREGUNTAS) + tuple(t for _, t in CHUNKS.values()) + TEXTOS_DEL_CASO
    )
    return Mundo(ruta, corpus, PuertosDeContextual(reranker=RerankerGuionado(GUIONES)), textos)
