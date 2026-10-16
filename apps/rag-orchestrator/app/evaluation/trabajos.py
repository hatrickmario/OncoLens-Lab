"""Un trabajo de medición = un candidato, una cuantización y una corrida, en su propio proceso (RSS limpio).

``ejecutar_trabajo`` recibe una ``Fabrica`` de envoltorios: ONNX Runtime en la medición real, modelos
falsos en las pruebas. Escribe un JSON con agregados (sin textos) en ``Trabajo.salida``.
"""

from __future__ import annotations

import hashlib
import json
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

import numpy as np

from app.evaluation import envoltorios
from app.evaluation.chunking_variants import ChunkCandidato, Seccion, Tokenizador, Variante, variantes_admitidas
from app.evaluation.config_medicion import ConfigMedicion, ModeloSpec
from app.evaluation.dataset_loader import Dataset, Pregunta
from app.evaluation.envoltorios import ClasificadorNli, Embedder, MonitorRss, Reranker
from app.evaluation.medicion_modelos import (
    Reloj,
    casos_nli,
    construir_corpus,
    cronometrar,
    entradas_espaciadas,
    evaluar_nli,
    evaluar_rankings,
    mediana,
    percentil_95,
    recuperar_densos,
    reordenar_con_reranker,
)
from app.evaluation.reporte import a_json_seguro
from app.evaluation.retrieval_metrics import ESCALA_COSENO, ESCALA_SIGMOIDE, agregar

SONDAS_DETERMINISMO = ["determinismo uno", "Instruct: determinismo dos", "x"]


@dataclass(frozen=True)
class Trabajo:
    spec: ModeloSpec
    cuantizacion: str
    corrida: int
    calidad: bool
    directorio_onnx: Path  # carpeta exportada del candidato (contiene fp32/ e int8/)
    directorio_corridas: Path  # <DATA_CACHE_DIR>/adr39/corridas
    salida: Path
    candidatos_dir: Path | None = None  # rankings y chunks: el embedding los escribe, el reranker los lee


class Fabrica(Protocol):
    """Construye los envoltorios de un candidato ya exportado (sin depender de ``Trabajo`` ni de la configuración)."""

    def embedder(self, spec: ModeloSpec, directorio: Path, cuantizacion: str, hilos: int) -> Embedder: ...
    def tokenizador(self, spec: ModeloSpec, directorio: Path) -> Tokenizador: ...
    def reranker(self, spec: ModeloSpec, directorio: Path, cuantizacion: str, hilos: int, max_length: int) -> Reranker: ...
    def nli(self, spec: ModeloSpec, directorio: Path, cuantizacion: str, hilos: int) -> ClasificadorNli: ...


class FabricaOnnx:
    """Envoltorios reales sobre ONNX Runtime."""

    def embedder(self, spec: ModeloSpec, directorio: Path, cuantizacion: str, hilos: int) -> Embedder:
        return envoltorios.EmbedderOnnx(spec, directorio, cuantizacion, hilos)

    def tokenizador(self, spec: ModeloSpec, directorio: Path) -> Tokenizador:
        return envoltorios.TokenizadorModelo(directorio, spec.max_length)

    def reranker(self, spec: ModeloSpec, directorio: Path, cuantizacion: str, hilos: int, max_length: int) -> Reranker:
        return envoltorios.RerankerOnnx(spec, directorio, cuantizacion, hilos, max_length)

    def nli(self, spec: ModeloSpec, directorio: Path, cuantizacion: str, hilos: int) -> ClasificadorNli:
        return envoltorios.NliOnnx(spec, directorio, cuantizacion, hilos)


def _estadisticas_latencia(tiempos: Sequence[float]) -> dict[str, float]:
    return {"p50_ms": mediana(tiempos), "p95_ms": percentil_95(tiempos), "max_ms": float(max(tiempos)), "n": len(tiempos)}


def _preguntas_con_respuesta(dataset: Dataset) -> list[Pregunta]:
    return [p for p in dataset.preguntas if p.modo_acierto != "sin_evidencia"]


def _huella_de_sondas(embedder: Embedder) -> str:
    vectores = embedder.codificar(SONDAS_DETERMINISMO, consulta=False)
    return hashlib.sha256(np.round(vectores, 4).tobytes()).hexdigest()[:16]


def _medir_con_rss(accion: Callable[[], list[float]]) -> tuple[list[float], float]:
    with MonitorRss() as monitor:
        tiempos = accion()
    return tiempos, monitor.maximo_mb


def _calidad_embeddings(
    trabajo: Trabajo,
    config: ConfigMedicion,
    dataset: Dataset,
    secciones: dict[str, Sequence[Seccion]],
    embedder: Embedder,
    fabrica: Fabrica,
    reloj: Reloj,
) -> dict[str, Any]:
    tokenizador = fabrica.tokenizador(trabajo.spec, trabajo.directorio_onnx)
    variante = Variante(config.chunking.tamano, config.chunking.solapamiento_pct, config.chunking.estrategia)
    admitidas, omitidas = variantes_admitidas([variante], tokenizador)
    if not admitidas:
        return {"omitida": omitidas}
    chunks = construir_corpus(secciones, tokenizador, variante)
    inicio = reloj()
    vectores = embedder.codificar([c.texto for c in chunks], consulta=False)
    segundos_corpus = reloj() - inicio
    pool = max(config.k, config.reranker_max_pairs)
    rankings = recuperar_densos(embedder, vectores, dataset.preguntas, pool)
    resultados = evaluar_rankings(dataset.preguntas, rankings, chunks, config.k)
    _guardar_candidatos(trabajo, chunks, rankings)
    metricas = agregar(resultados, config.semilla_bootstrap, config.bootstrap_repeticiones, escala_puntaje=ESCALA_COSENO)
    return {
        "chunking": variante.etiqueta,
        "numero_chunks": len(chunks),
        "dimension": int(vectores.shape[1]),
        "segundos_codificar_corpus": segundos_corpus,
        "metricas": metricas,
    }


def _guardar_candidatos(trabajo: Trabajo, chunks: Sequence[ChunkCandidato], rankings: dict[str, list[tuple[int, float]]]) -> None:
    """Rankings y chunks del embedding, para que el reranker mida sobre el mismo conjunto (caché, no el repo)."""
    carpeta = trabajo.candidatos_dir
    assert carpeta is not None, "el trabajo de embeddings con calidad recibe su carpeta de candidatos"
    carpeta.mkdir(parents=True, exist_ok=True)
    (carpeta / "chunks.json").write_text(
        json.dumps([{"documento": c.documento, "texto": c.texto, "seccion": c.seccion} for c in chunks], ensure_ascii=False),
        encoding="utf-8",
    )
    (carpeta / "rankings.json").write_text(json.dumps(rankings), encoding="utf-8")


def _trabajo_embeddings(
    trabajo: Trabajo, config: ConfigMedicion, dataset: Dataset, secciones: dict[str, Sequence[Seccion]], fabrica: Fabrica, reloj: Reloj
) -> dict[str, Any]:
    embedder = fabrica.embedder(trabajo.spec, trabajo.directorio_onnx, trabajo.cuantizacion, config.hilos_cpu)
    rss_carga = MonitorRss().actual_mb()
    preguntas = entradas_espaciadas([p for p in _preguntas_con_respuesta(dataset) if p.idioma == "es"], config.consultas_por_corrida)
    consultas = [f"{p.texto}\n{config.contexto_resumen}" for p in preguntas if isinstance(p, Pregunta)]
    tiempos, rss_max = _medir_con_rss(
        lambda: cronometrar(lambda q: embedder.codificar([str(q)], consulta=True), consultas, config.calentamiento, reloj)
    )
    resultado: dict[str, Any] = {
        "rss_carga_mb": rss_carga,
        "rss_max_mb": rss_max,
        "latencia": _estadisticas_latencia(tiempos),
        "huella_sondas": _huella_de_sondas(embedder),
    }
    if trabajo.calidad:
        resultado["calidad"] = _calidad_embeddings(trabajo, config, dataset, secciones, embedder, fabrica, reloj)
        pesos = getattr(embedder, "pesos_sparse", None)
        if pesos is not None and trabajo.spec.sparse:
            muestra = pesos(dataset.preguntas[0].texto)
            resultado["sparse"] = {"disponible": True, "tokens_no_nulos_en_sonda": len(muestra)}
    return resultado


def _trabajo_reranker(trabajo: Trabajo, config: ConfigMedicion, dataset: Dataset, fabrica: Fabrica, reloj: Reloj) -> dict[str, Any]:
    assert trabajo.candidatos_dir is not None
    chunks = json.loads((trabajo.candidatos_dir / "chunks.json").read_text(encoding="utf-8"))
    rankings = {k: [(int(i), float(s)) for i, s in v] for k, v in json.loads((trabajo.candidatos_dir / "rankings.json").read_text(encoding="utf-8")).items()}
    candidatos = [ChunkCandidato(c["documento"], c["texto"], c["seccion"], 0) for c in chunks]
    reranker = fabrica.reranker(trabajo.spec, trabajo.directorio_onnx, trabajo.cuantizacion, config.hilos_cpu, config.reranker_max_length)
    rss_carga = MonitorRss().actual_mb()
    preguntas = entradas_espaciadas(_preguntas_con_respuesta(dataset), config.lotes_reranker_por_corrida)
    lotes = [(p.texto, [candidatos[i].texto for i, _ in rankings[p.id][: config.reranker_max_pairs]]) for p in preguntas if isinstance(p, Pregunta)]
    tiempos, rss_max = _medir_con_rss(
        lambda: cronometrar(lambda lote: reranker.puntuar(lote[0], lote[1]), lotes, config.calentamiento, reloj)  # type: ignore[index]
    )
    resultado: dict[str, Any] = {"rss_carga_mb": rss_carga, "rss_max_mb": rss_max, "latencia": _estadisticas_latencia(tiempos)}
    if trabajo.calidad:
        reordenado = reordenar_con_reranker(reranker, dataset.preguntas, rankings, candidatos, config.reranker_max_pairs)
        denso = {k: v[: config.reranker_max_pairs] for k, v in rankings.items()}
        resultado["calidad"] = {
            "pares_por_consulta": config.reranker_max_pairs,
            "metricas": agregar(evaluar_rankings(dataset.preguntas, reordenado, candidatos, config.k), config.semilla_bootstrap, config.bootstrap_repeticiones, escala_puntaje=ESCALA_SIGMOIDE),
            "metricas_densas_mismo_conjunto": agregar(evaluar_rankings(dataset.preguntas, denso, candidatos, config.k), config.semilla_bootstrap, config.bootstrap_repeticiones, escala_puntaje=ESCALA_COSENO),
        }
    return resultado


def _trabajo_nli(trabajo: Trabajo, config: ConfigMedicion, dataset: Dataset, fabrica: Fabrica, reloj: Reloj) -> dict[str, Any]:
    clasificador = fabrica.nli(trabajo.spec, trabajo.directorio_onnx, trabajo.cuantizacion, config.hilos_cpu)
    rss_carga = MonitorRss().actual_mb()
    pares = [(c[0], c[1]) for c in casos_nli(dataset.pares_nli)]
    lotes = [pares[i : i + config.tamano_lote_nli] for i in range(0, len(pares), config.tamano_lote_nli)]
    tiempos, rss_max = _medir_con_rss(
        lambda: cronometrar(lambda lote: clasificador.clasificar(lote), lotes, config.calentamiento, reloj)  # type: ignore[arg-type]
    )
    resultado: dict[str, Any] = {"rss_carga_mb": rss_carga, "rss_max_mb": rss_max, "latencia": _estadisticas_latencia(tiempos)}
    if trabajo.calidad:
        resultado["calidad"] = {"exactitud": evaluar_nli(clasificador, dataset.pares_nli)}
    return resultado


def ejecutar_trabajo(
    trabajo: Trabajo,
    config: ConfigMedicion,
    dataset: Dataset,
    secciones: dict[str, Sequence[Seccion]],
    fabrica: Fabrica,
    reloj: Reloj,
) -> dict[str, Any]:
    """Mide un candidato en esta corrida y escribe el resultado en ``trabajo.salida``."""
    if trabajo.spec.componente == "embeddings":
        medido = _trabajo_embeddings(trabajo, config, dataset, secciones, fabrica, reloj)
    elif trabajo.spec.componente == "reranker":
        medido = _trabajo_reranker(trabajo, config, dataset, fabrica, reloj)
    elif trabajo.spec.componente == "nli":
        medido = _trabajo_nli(trabajo, config, dataset, fabrica, reloj)
    else:
        raise ValueError(f"componente desconocido: {trabajo.spec.componente!r}")
    resultado = {
        "clave": trabajo.spec.clave,
        "modelo": trabajo.spec.modelo,
        "revision": trabajo.spec.revision,
        "cuantizacion": trabajo.cuantizacion,
        "corrida": trabajo.corrida,
        "pico_rss_mb": envoltorios.pico_rss_mb(),
        **medido,
    }
    serializable: dict[str, Any] = a_json_seguro(resultado)
    trabajo.salida.parent.mkdir(parents=True, exist_ok=True)
    trabajo.salida.write_text(json.dumps(serializable, indent=2, allow_nan=False), encoding="utf-8")
    return serializable
