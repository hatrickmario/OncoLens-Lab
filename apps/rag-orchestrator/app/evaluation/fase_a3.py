"""Medición complementaria de ADR-39: bge-reranker-v2-m3 sobre chunks de 1024 tokens (decisión del usuario 2026-10-20).

Por escenario (tamaño de chunk, ``RERANKER_MAX_LENGTH``, ``RERANKER_MAX_PAIRS``): recall@10 y MRR tras el *reranker*,
p95 por lote, RSS; mediana de 3 corridas, cada una en un proceso nuevo. Las reglas (presupuesto, riesgo extremo a
extremo, palancas viables) se fijan en ``eval/configs/adr39-fase-a3.yaml`` antes de medir. Reporte con agregados.
"""

from __future__ import annotations

import json
import math
import statistics
import sys
import time
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import yaml

from app.evaluation.chunking_variants import ESTRATEGIA_TAMANO_FIJO, ChunkCandidato, Seccion, Variante
from app.evaluation.config_medicion import ModeloSpec
from app.evaluation.dataset_loader import Dataset, DatasetInvalido, Pregunta, cargar_dataset
from app.evaluation.envoltorios import MonitorRss, pico_rss_mb
from app.evaluation.medicion_modelos import (
    construir_corpus,
    cronometrar,
    entradas_espaciadas,
    evaluar_rankings,
    mediana,
    percentil_95,
    recuperar_densos,
    reordenar_con_reranker,
)
from app.evaluation.reporte import a_json_seguro, escribir_reporte
from app.evaluation.retrieval_metrics import agregar
from app.evaluation.trabajos import Fabrica

SALIDA_OK, SALIDA_DATASET, SALIDA_FUENTE = 0, 2, 3


@dataclass(frozen=True)
class Escenario:
    id: str
    tamano_chunk: int
    max_length: int
    max_pairs: int
    rol: str


@dataclass(frozen=True)
class ReglasA3:
    presupuesto_redondeo_ms: float
    llm_generacion_ms_supuesto: float
    p95_extremo_a_extremo_objetivo_ms: float
    margen_riesgo_ms: float
    p95_viable_ms: float
    p95_otras_etapas_ms: dict[str, float]


@dataclass(frozen=True)
class ConfigA3:
    dataset: str
    semilla_bootstrap: int
    bootstrap_repeticiones: int
    corridas: int
    calentamiento: int
    hilos_cpu: int
    lotes_por_corrida: int
    k: int
    tolerancia_empate: float
    cuantizacion: str
    embedding: ModeloSpec
    reranker: ModeloSpec
    escenarios: tuple[Escenario, ...]
    reglas: ReglasA3
    reporte: str


def cargar_config_a3(ruta: Path) -> ConfigA3:
    crudo = yaml.safe_load(ruta.read_text(encoding="utf-8"))
    p = crudo["protocolo"]
    emb, rer = crudo["embedding"], crudo["reranker"]
    r = crudo["reglas"]
    return ConfigA3(
        dataset=crudo["dataset"],
        semilla_bootstrap=int(crudo["semilla_bootstrap"]),
        bootstrap_repeticiones=int(crudo["bootstrap_repeticiones"]),
        corridas=int(p["corridas"]),
        calentamiento=int(p["calentamiento"]),
        hilos_cpu=int(p["hilos_cpu"]),
        lotes_por_corrida=int(p["lotes_por_corrida"]),
        k=int(p["k"]),
        tolerancia_empate=float(p["tolerancia_empate"]),
        cuantizacion=p["cuantizacion"],
        embedding=ModeloSpec(
            id=str(emb["id"]), componente="embeddings", modelo=emb["modelo"], revision=emb["revision"], tarea="embedding",
            max_length=int(emb["max_length"]), pooling=emb["pooling"], sparse=emb.get("sparse", ""),
        ),
        reranker=ModeloSpec(
            id=str(rer["id"]), componente="reranker", modelo=rer["modelo"], revision=rer["revision"], tarea=rer["tarea"],
            max_length=int(rer["max_length"]),
        ),
        escenarios=tuple(
            Escenario(e["id"], int(e["chunk"]), int(e["max_length"]), int(e["max_pairs"]), e["rol"]) for e in crudo["escenarios"]
        ),
        reglas=ReglasA3(
            presupuesto_redondeo_ms=float(r["presupuesto_redondeo_ms"]),
            llm_generacion_ms_supuesto=float(r["llm_generacion_ms_supuesto"]),
            p95_extremo_a_extremo_objetivo_ms=float(r["p95_extremo_a_extremo_objetivo_ms"]),
            margen_riesgo_ms=float(r["margen_riesgo_ms"]),
            p95_viable_ms=float(r["p95_viable_ms"]),
            p95_otras_etapas_ms={k: float(v) for k, v in r["p95_otras_etapas_ms"].items()},
        ),
        reporte=crudo["reporte"],
    )


@dataclass(frozen=True)
class TrabajoA3:
    escenario: Escenario
    corrida: int
    calidad: bool
    directorio_candidatos: Path  # chunks.json y rankings.json del tamaño de chunk del escenario
    directorio_onnx_reranker: Path
    salida: Path


# --- reglas puras -----------------------------------------------------------------------------------------------


def redondear_hacia_arriba(valor_ms: float, multiplo_ms: float) -> float:
    return math.ceil(valor_ms / multiplo_ms) * multiplo_ms


def p95_extremo_a_extremo_ms(p95_reranker_ms: float, reglas: ReglasA3) -> float:
    """Cota superior del p95 de ``/platform/evidence-analyses``: suma de p95 de etapas + generación del LLM (supuesto)."""
    return sum(reglas.p95_otras_etapas_ms.values()) + p95_reranker_ms + reglas.llm_generacion_ms_supuesto


def evaluar_extremo_a_extremo(p95_reranker_ms: float, reglas: ReglasA3) -> dict[str, Any]:
    total = p95_extremo_a_extremo_ms(p95_reranker_ms, reglas)
    margen = reglas.p95_extremo_a_extremo_objetivo_ms - total
    return {
        "p95_reranker_ms": p95_reranker_ms,
        "p95_estimado_ms": total,
        "margen_ms": margen,
        "riesgo": "alto" if margen < reglas.margen_riesgo_ms else "aceptable",
    }


def derivar_conclusiones(agregados: dict[str, dict[str, Any]], escenarios: Sequence[Escenario], config: ConfigA3) -> dict[str, Any]:
    """Presupuesto del *reranker*, riesgo extremo a extremo y palancas viables, con las reglas fijadas antes de medir."""
    reglas = config.reglas
    por_rol = {e.rol: e for e in escenarios if e.rol in ("referencia", "vigente")}
    vigente, base = agregados[por_rol["vigente"].id], agregados[por_rol["referencia"].id]
    recall_vigente = vigente["calidad"]["metricas"]["total"]["recall_at_10"]
    recall_base = base["calidad"]["metricas"]["total"]["recall_at_10"]
    calidad_sostenida = recall_vigente >= recall_base - config.tolerancia_empate
    presupuesto = redondear_hacia_arriba(vigente["p95_ms"], reglas.presupuesto_redondeo_ms)
    palancas = []
    for e in escenarios:
        a = agregados[e.id]
        recall = a["calidad"]["metricas"]["total"]["recall_at_10"]
        palancas.append(
            {
                "escenario": e.id,
                "rol": e.rol,
                "recall_at_10": recall,
                "delta_recall_vs_vigente": recall - recall_vigente,
                "p95_ms": a["p95_ms"],
                "delta_p95_vs_vigente_ms": a["p95_ms"] - vigente["p95_ms"],
                "dentro_de_tolerancia_de_calidad": recall >= recall_vigente - config.tolerancia_empate,
                "dentro_del_presupuesto_original": a["p95_ms"] <= reglas.p95_viable_ms,
                "viable": recall >= recall_vigente - config.tolerancia_empate and a["p95_ms"] <= reglas.p95_viable_ms,
                "extremo_a_extremo": evaluar_extremo_a_extremo(a["p95_ms"], reglas),
            }
        )
    return {
        "calidad_del_vigente_sostiene_la_base": calidad_sostenida,
        "presupuesto_reranker_ms": presupuesto if calidad_sostenida else None,
        "presupuesto_regla": f"p95 mediano del escenario vigente redondeado hacia arriba a {reglas.presupuesto_redondeo_ms:.0f} ms",
        "extremo_a_extremo_con_presupuesto": evaluar_extremo_a_extremo(presupuesto, reglas),
        "extremo_a_extremo_con_p95_medido": evaluar_extremo_a_extremo(vigente["p95_ms"], reglas),
        "palancas": palancas,
    }


def agregar_corridas_a3(corridas: Sequence[dict[str, Any]]) -> dict[str, Any]:
    """Mediana de p95 y RSS sobre las corridas; la calidad sale de la corrida 1 (determinista)."""
    primera = next(c for c in corridas if "calidad" in c)
    return {
        "corridas": len(corridas),
        "rss_carga_mb": statistics.median(c["rss_carga_mb"] for c in corridas),
        "rss_max_mb": statistics.median(c["rss_max_mb"] for c in corridas),
        "pico_rss_mb": statistics.median(c["pico_rss_mb"] for c in corridas),
        "p50_ms": statistics.median(c["latencia"]["p50_ms"] for c in corridas),
        "p95_ms": statistics.median(c["latencia"]["p95_ms"] for c in corridas),
        "p95_ms_por_corrida": [c["latencia"]["p95_ms"] for c in corridas],
        "rss_max_mb_por_corrida": [c["rss_max_mb"] for c in corridas],
        "calidad": primera["calidad"],
    }


# --- trabajo de un proceso --------------------------------------------------------------------------------------


def _leer_candidatos(carpeta: Path) -> tuple[list[ChunkCandidato], dict[str, list[tuple[int, float]]]]:
    chunks = json.loads((carpeta / "chunks.json").read_text(encoding="utf-8"))
    crudos = json.loads((carpeta / "rankings.json").read_text(encoding="utf-8"))
    return (
        [ChunkCandidato(c["documento"], c["texto"], c["seccion"], 0) for c in chunks],
        {k: [(int(i), float(s)) for i, s in v] for k, v in crudos.items()},
    )


def ejecutar_trabajo_a3(trabajo: TrabajoA3, config: ConfigA3, dataset: Dataset, fabrica: Fabrica, reloj: Callable[[], float]) -> dict[str, Any]:
    """Mide un escenario en esta corrida y escribe el resultado en ``trabajo.salida`` (solo agregados)."""
    e = trabajo.escenario
    candidatos, rankings = _leer_candidatos(trabajo.directorio_candidatos)
    reranker = fabrica.reranker(config.reranker, trabajo.directorio_onnx_reranker, config.cuantizacion, config.hilos_cpu, e.max_length)
    rss_carga = MonitorRss().actual_mb()
    con_respuesta = [p for p in dataset.preguntas if p.modo_acierto != "sin_evidencia"]
    lotes = [
        (p.texto, [candidatos[i].texto for i, _ in rankings[p.id][: e.max_pairs]])
        for p in entradas_espaciadas(con_respuesta, config.lotes_por_corrida)
        if isinstance(p, Pregunta)
    ]
    with MonitorRss() as monitor:
        tiempos = cronometrar(lambda lote: reranker.puntuar(lote[0], lote[1]), lotes, config.calentamiento, reloj)  # type: ignore[index]
    resultado: dict[str, Any] = {
        "escenario": e.id,
        "corrida": trabajo.corrida,
        "rss_carga_mb": rss_carga,
        "rss_max_mb": monitor.maximo_mb,
        "pico_rss_mb": pico_rss_mb(),
        "latencia": {"p50_ms": mediana(tiempos), "p95_ms": percentil_95(tiempos), "max_ms": float(max(tiempos)), "n": len(tiempos)},
    }
    if trabajo.calidad:
        reordenado = reordenar_con_reranker(reranker, dataset.preguntas, rankings, candidatos, e.max_pairs)
        denso = {k: v[: e.max_pairs] for k, v in rankings.items()}
        resultado["calidad"] = {
            "pares_por_consulta": e.max_pairs,
            "metricas": agregar(evaluar_rankings(dataset.preguntas, reordenado, candidatos, config.k), config.semilla_bootstrap, config.bootstrap_repeticiones),
            "metricas_densas_mismo_conjunto": agregar(evaluar_rankings(dataset.preguntas, denso, candidatos, config.k), config.semilla_bootstrap, config.bootstrap_repeticiones),
        }
    serializable: dict[str, Any] = a_json_seguro(resultado)
    trabajo.salida.parent.mkdir(parents=True, exist_ok=True)
    trabajo.salida.write_text(json.dumps(serializable, indent=2, allow_nan=False), encoding="utf-8")
    return serializable


# --- orquestación -----------------------------------------------------------------------------------------------

Ejecutor = Callable[[TrabajoA3], None]


def preparar_candidatos(
    config: ConfigA3,
    tamano_chunk: int,
    pool: int,
    dataset: Dataset,
    secciones: dict[str, Sequence[Seccion]],
    fabrica: Fabrica,
    dir_onnx_embedding: Path,
    dir_vectores: Path,
    destino: Path,
) -> int:
    """Top-``pool`` densos por pregunta con chunks de ``tamano_chunk`` tokens; devuelve el número de chunks (caché en disco)."""
    if (destino / "rankings.json").exists():
        return len(json.loads((destino / "chunks.json").read_text(encoding="utf-8")))
    embedder = fabrica.embedder(config.embedding, dir_onnx_embedding, config.cuantizacion, config.hilos_cpu)
    tokenizador = fabrica.tokenizador(config.embedding, dir_onnx_embedding)
    variante = Variante(tamano_chunk, 0.0, ESTRATEGIA_TAMANO_FIJO)
    chunks = construir_corpus(secciones, tokenizador, variante)
    ruta = dir_vectores / f"{config.embedding.clave}-{config.cuantizacion}-{variante.etiqueta}.npy"
    if ruta.exists():
        vectores = np.load(ruta)
    else:
        vectores = embedder.codificar([c.texto for c in chunks], consulta=False)
        ruta.parent.mkdir(parents=True, exist_ok=True)
        np.save(ruta, vectores)
    rankings = recuperar_densos(embedder, vectores, dataset.preguntas, pool)
    destino.mkdir(parents=True, exist_ok=True)
    (destino / "chunks.json").write_text(
        json.dumps([{"documento": c.documento, "texto": c.texto, "seccion": c.seccion} for c in chunks], ensure_ascii=False), encoding="utf-8"
    )
    (destino / "rankings.json").write_text(json.dumps(rankings), encoding="utf-8")
    return len(chunks)


def ejecutar_fase_a3(
    config: ConfigA3,
    dataset: Dataset,
    secciones: dict[str, Sequence[Seccion]],
    fabrica: Fabrica,
    dir_modelos: Path,
    cache_datos: Path,
    ruta_reporte: Path,
    ejecutor: Ejecutor,
    ahora: Callable[[], datetime],
) -> int:
    dir_corridas = cache_datos / "adr39" / "corridas-a3"
    pool = max(e.max_pairs for e in config.escenarios)
    chunks_por_tamano: dict[int, int] = {}
    for tamano in sorted({e.tamano_chunk for e in config.escenarios}):
        chunks_por_tamano[tamano] = preparar_candidatos(
            config, tamano, pool, dataset, secciones, fabrica,
            dir_modelos / "onnx" / config.embedding.directorio, cache_datos / "adr39" / "vectores", dir_corridas / f"candidatos-{tamano}",
        )
    agregados: dict[str, dict[str, Any]] = {}
    for e in config.escenarios:
        corridas = []
        for n in range(1, config.corridas + 1):
            salida = dir_corridas / f"{e.id}-corrida{n}.json"
            if not salida.exists():
                ejecutor(TrabajoA3(e, n, n == 1, dir_corridas / f"candidatos-{e.tamano_chunk}", dir_modelos / "onnx" / config.reranker.directorio, salida))
            corridas.append(json.loads(salida.read_text(encoding="utf-8")))
        agregados[e.id] = {**agregar_corridas_a3(corridas), "tamano_chunk": e.tamano_chunk, "max_length": e.max_length, "max_pairs": e.max_pairs, "rol": e.rol, "numero_chunks": chunks_por_tamano[e.tamano_chunk]}
    reporte = {
        "fase": "A3",
        "fecha": ahora().date().isoformat(),
        "dataset": {"nombre": dataset.nombre, "version": dataset.version, "preguntas": len(dataset.preguntas)},
        "reranker": {"modelo": config.reranker.modelo, "revision": config.reranker.revision, "cuantizacion": config.cuantizacion},
        "embedding": {"modelo": config.embedding.modelo, "revision": config.embedding.revision, "cuantizacion": config.cuantizacion},
        "protocolo": {"corridas": config.corridas, "calentamiento": config.calentamiento, "hilos_cpu": config.hilos_cpu, "lotes_por_corrida": config.lotes_por_corrida},
        "escenarios": agregados,
        "conclusiones": derivar_conclusiones(agregados, config.escenarios, config),
    }
    escribir_reporte(ruta_reporte, reporte)
    print(f"reporte: {ruta_reporte}")
    return SALIDA_OK


def ejecutar_cli(ruta_config: Path, cache_modelos: Path, cache_datos: Path, salida: Path | None, lanzar: Callable[[TrabajoA3, Path], None]) -> int:
    """Punto de entrada del CLI: dataset y fuentes desde la caché, envoltorios ONNX reales."""
    from app.evaluation.trabajos import FabricaOnnx
    from app.scripts.adr39_fetch_sources import FuenteNoDescargable, leer_fuentes_de_cache
    from app.scripts.adr39_measure import raiz_repo

    config = cargar_config_a3(ruta_config)
    try:
        dataset = cargar_dataset(raiz_repo() / config.dataset)
        secciones = {i: f.secciones for i, f in leer_fuentes_de_cache(dataset, cache_datos).items()}
    except DatasetInvalido as exc:
        print(f"dataset inválido, no se mide nada: {exc}", file=sys.stderr)
        return SALIDA_DATASET
    except FuenteNoDescargable as exc:
        print(str(exc), file=sys.stderr)
        return SALIDA_FUENTE
    return ejecutar_fase_a3(
        config, dataset, secciones, FabricaOnnx(), cache_modelos, cache_datos, salida or raiz_repo() / config.reporte,
        lambda t: lanzar(t, ruta_config), lambda: datetime.now(timezone.utc),
    )


def trabajo_desde_json(carga: dict[str, Any]) -> TrabajoA3:
    return TrabajoA3(
        Escenario(**carga["escenario"]), carga["corrida"], carga["calidad"], Path(carga["directorio_candidatos"]),
        Path(carga["directorio_onnx_reranker"]), Path(carga["salida"]),
    )


def trabajo_a_json(trabajo: TrabajoA3) -> dict[str, Any]:
    return {
        "escenario": {"id": trabajo.escenario.id, "tamano_chunk": trabajo.escenario.tamano_chunk, "max_length": trabajo.escenario.max_length, "max_pairs": trabajo.escenario.max_pairs, "rol": trabajo.escenario.rol},
        "corrida": trabajo.corrida,
        "calidad": trabajo.calidad,
        "directorio_candidatos": str(trabajo.directorio_candidatos),
        "directorio_onnx_reranker": str(trabajo.directorio_onnx_reranker),
        "salida": str(trabajo.salida),
    }


def trabajar_a3(carga: dict[str, Any], ruta_config: Path, cache_datos: Path) -> int:
    from app.evaluation.trabajos import FabricaOnnx
    from app.scripts.adr39_measure import raiz_repo

    config = cargar_config_a3(ruta_config)
    dataset = cargar_dataset(raiz_repo() / config.dataset)
    ejecutar_trabajo_a3(trabajo_desde_json(carga), config, dataset, FabricaOnnx(), time.perf_counter)
    return SALIDA_OK
