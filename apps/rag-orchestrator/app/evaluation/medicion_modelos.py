"""Procedimientos de medición de ADR-39 sobre puertos (``Embedder``, ``Reranker``, ``ClasificadorNli``).

Sin ONNX ni red: reciben los envoltorios, por eso se prueban con modelos falsos diminutos.
El reloj se inyecta (``reloj``) para que las pruebas sean deterministas.
"""

from __future__ import annotations

import math
import statistics
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from app.evaluation.chunking_variants import ChunkCandidato, Seccion, Variante, fragmentar
from app.evaluation.chunking_variants import Tokenizador
from app.evaluation.dataset_loader import ParNli, Pregunta
from app.domain.normalizacion_puntaje import normalizar_a_unidad
from app.evaluation.envoltorios import ClasificadorNli, Embedder, Reranker
from app.evaluation.retrieval_metrics import ChunkRecuperado, ResultadoPregunta, evaluar_pregunta

Reloj = Callable[[], float]
ETIQUETAS = ("entailment", "neutral", "contradiction")


def construir_corpus(
    secciones_por_documento: dict[str, Sequence[Seccion]],
    tokenizador: Tokenizador,
    variante: Variante,
) -> list[ChunkCandidato]:
    """Chunks de todos los documentos con una variante, en orden estable por id de documento."""
    chunks: list[ChunkCandidato] = []
    for documento in sorted(secciones_por_documento):
        chunks.extend(
            fragmentar(documento, secciones_por_documento[documento], tokenizador, variante)
        )
    return chunks


def vectores_en_cache(ruta: Path, textos: Sequence[str], embedder: Embedder) -> np.ndarray:
    """Vectores de los chunks desde ``ruta`` (``.npy``); se recodifican si faltan o no corresponden al número de textos."""
    if ruta.exists():
        guardados = np.load(ruta)
        if guardados.shape[0] == len(textos):
            return guardados
    vectores = embedder.codificar(list(textos), consulta=False)
    ruta.parent.mkdir(parents=True, exist_ok=True)
    np.save(ruta, vectores)
    return vectores


def recuperar_densos(
    embedder: Embedder, vectores_chunks: np.ndarray, preguntas: Sequence[Pregunta], k_pool: int
) -> dict[str, list[tuple[int, float]]]:
    """Top-``k_pool`` por similitud coseno (vectores normalizados) para cada pregunta: [(indice_chunk, puntaje)]."""
    consultas = embedder.codificar([p.texto for p in preguntas], consulta=True)
    puntajes = consultas @ vectores_chunks.T
    ranking: dict[str, list[tuple[int, float]]] = {}
    for fila, pregunta in enumerate(preguntas):
        orden = np.argsort(-puntajes[fila], kind="stable")[:k_pool]
        ranking[pregunta.id] = [(int(i), float(puntajes[fila, i])) for i in orden]
    return ranking


def evaluar_rankings(
    preguntas: Sequence[Pregunta],
    rankings: dict[str, list[tuple[int, float]]],
    chunks: Sequence[ChunkCandidato],
    k: int,
) -> list[ResultadoPregunta]:
    resultados = []
    for pregunta in preguntas:
        recuperados = [
            ChunkRecuperado(chunks[i].documento, chunks[i].texto, puntaje)
            for i, puntaje in rankings[pregunta.id]
        ]
        resultados.append(evaluar_pregunta(pregunta, recuperados, k))
    return resultados


def reordenar_con_reranker(
    reranker: Reranker,
    preguntas: Sequence[Pregunta],
    candidatos: dict[str, list[tuple[int, float]]],
    chunks: Sequence[ChunkCandidato],
    max_pares: int,
) -> dict[str, list[tuple[int, float]]]:
    """Reordena los primeros ``max_pares`` candidatos densos de cada pregunta; el puntaje queda normalizado a [0, 1]."""
    reordenado: dict[str, list[tuple[int, float]]] = {}
    for pregunta in preguntas:
        pool = candidatos[pregunta.id][:max_pares]
        crudos = reranker.puntuar(pregunta.texto, [chunks[i].texto for i, _ in pool])
        normalizados = normalizar_a_unidad(crudos)
        orden = sorted(range(len(pool)), key=lambda j: -crudos[j])
        reordenado[pregunta.id] = [(pool[j][0], normalizados[j]) for j in orden]
    return reordenado


@dataclass(frozen=True)
class ExactitudNli:
    total: float
    mismo_idioma: float
    mezcla_es_en: float
    n_mismo_idioma: int
    n_mezcla: int
    por_etiqueta: dict[str, float]


def casos_nli(pares: Sequence[ParNli]) -> list[tuple[str, str, str, bool]]:
    """(fragmento, afirmación, etiqueta, mismo idioma que el fragmento): cada par aporta su afirmación y su variante."""
    casos: list[tuple[str, str, str, bool]] = []
    for par in pares:
        casos.append(
            (
                par.fragmento,
                par.afirmacion,
                par.etiqueta,
                par.idioma_afirmacion == par.idioma_fragmento,
            )
        )
        if par.variante_otro_idioma:
            casos.append(
                (
                    par.fragmento,
                    par.variante_otro_idioma,
                    par.etiqueta,
                    par.idioma_afirmacion != par.idioma_fragmento,
                )
            )
    return casos


def evaluar_nli(
    clasificador: ClasificadorNli, pares: Sequence[ParNli], tamano_lote: int = 16
) -> ExactitudNli:
    """Exactitud sobre pares etiquetados, con la afirmación en el idioma original y en la variante del otro idioma.

    Los fragmentos están en inglés: la afirmación en inglés es "mismo idioma"; en español, "mezcla es/en".
    """
    casos = casos_nli(pares)
    predichas: list[str] = []
    for i in range(0, len(casos), tamano_lote):
        predichas.extend(
            clasificador.clasificar([(c[0], c[1]) for c in casos[i : i + tamano_lote]])
        )
    aciertos = [p == c[2] for p, c in zip(predichas, casos)]
    mismo = [a for a, c in zip(aciertos, casos) if c[3]]
    mezcla = [a for a, c in zip(aciertos, casos) if not c[3]]
    por_etiqueta = {
        e: float(np.mean([a for a, c in zip(aciertos, casos) if c[2] == e]))
        for e in ETIQUETAS
        if any(c[2] == e for c in casos)
    }
    return ExactitudNli(
        total=float(np.mean(aciertos)),
        mismo_idioma=float(np.mean(mismo)) if mismo else math.nan,
        mezcla_es_en=float(np.mean(mezcla)) if mezcla else math.nan,
        n_mismo_idioma=len(mismo),
        n_mezcla=len(mezcla),
        por_etiqueta=por_etiqueta,
    )


def cronometrar(
    funcion: Callable[[object], object],
    entradas: Sequence[object],
    calentamiento: int,
    reloj: Reloj,
) -> list[float]:
    """Milisegundos de cada llamada tras descartar ``calentamiento`` llamadas (carga del modelo fuera del cronómetro)."""
    for entrada in list(entradas)[:calentamiento] or list(entradas)[:1]:
        funcion(entrada)
    tiempos = []
    for entrada in entradas:
        inicio = reloj()
        funcion(entrada)
        tiempos.append((reloj() - inicio) * 1000.0)
    return tiempos


def percentil_95(valores: Sequence[float]) -> float:
    return float(np.percentile(np.asarray(valores, dtype=float), 95))


def mediana(valores: Sequence[float]) -> float:
    return float(statistics.median(valores))


def entradas_espaciadas(items: Sequence[object], cuantas: int) -> list[object]:
    """``cuantas`` elementos repartidos de forma determinista a lo largo de ``items``."""
    if cuantas >= len(items):
        return list(items)
    paso = len(items) / cuantas
    return [items[int(i * paso)] for i in range(cuantas)]
