"""Pruebas acotadas T2–T5 de ADR-39: tamaño de chunk, solapamiento, estrategia e índice (D8, AC-10 a AC-12).

Una prueba por factor, los demás fijos, en secuencia: el ganador de cada una queda fijo en la siguiente. Siempre sobre el
modelo de *embeddings* ganador de la fase A y el golden de ``data/eval/adr39-mini/``. Reporte con agregados, sin textos.
"""

from __future__ import annotations

import json
import sys
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

import numpy as np
import yaml

from app.evaluation.chunking_variants import (
    ESTRATEGIA_TAMANO_FIJO,
    ChunkCandidato,
    Seccion,
    Variante,
    variantes_admitidas,
)
from app.evaluation.config_medicion import ModeloSpec, spec_desde_yaml
from app.evaluation.dataset_loader import Dataset
from app.evaluation.indices_milvus import (
    ComparadorIndices,
    estimar_bytes_indice,
    recall_frente_a_flat,
)
from app.evaluation.medicion_modelos import (
    construir_corpus,
    evaluar_rankings,
    mediana,
    percentil_95,
    recuperar_densos,
    vectores_en_cache,
)
from app.evaluation.model_selection import MedicionVariante, seleccionar_variante
from app.evaluation.reporte import escribir_reporte
from app.evaluation.retrieval_metrics import ESCALA_COSENO, agregar
from app.infrastructure.milvus.schema import parametros_de_busqueda, parametros_de_construccion
from app.evaluation.trabajos import Fabrica

SALIDA_OK, SALIDA_PREVIA = 0, 6


@dataclass(frozen=True)
class ConfigA2:
    dataset: str
    semilla_bootstrap: int
    bootstrap_repeticiones: int
    hilos_cpu: int
    k: int
    spec: ModeloSpec
    cuantizacion: str
    chunk_selection_margin: float
    index_min_recall_vs_flat: float
    tamanos: tuple[int, ...]
    solapamientos: tuple[float, ...]
    estrategias: tuple[str, ...]
    indices: tuple[str, ...]
    parametros_hnsw: dict[str, Any]
    milvus_uri: str
    consultas_latencia_indice: int
    reporte: str
    base: Variante


def cargar_config_a2(ruta: Path) -> ConfigA2:
    crudo = yaml.safe_load(ruta.read_text(encoding="utf-8"))
    emb = crudo["embedding"]
    spec = spec_desde_yaml("embeddings", emb)
    return ConfigA2(
        dataset=crudo["dataset"],
        semilla_bootstrap=int(crudo["semilla_bootstrap"]),
        bootstrap_repeticiones=int(crudo["bootstrap_repeticiones"]),
        hilos_cpu=int(crudo["hilos_cpu"]),
        k=int(crudo["k"]),
        spec=spec,
        cuantizacion=emb["cuantizacion"],
        chunk_selection_margin=float(crudo["chunk_selection_margin"]),
        index_min_recall_vs_flat=float(crudo["index_min_recall_vs_flat"]),
        tamanos=tuple(int(t) for t in crudo["t2"]["tamanos"]),
        solapamientos=tuple(float(p) for p in crudo["t3"]["solapamientos_pct"]),
        estrategias=tuple(crudo["t4"]["estrategias"]),
        indices=tuple(crudo["t5"]["indices"]),
        parametros_hnsw=dict(crudo["t5"]["hnsw"]),
        milvus_uri=str(crudo["t5"]["milvus_uri"]),
        consultas_latencia_indice=int(crudo["t5"]["pasadas_latencia"]),
        reporte=crudo["reporte"],
        base=Variante(
            int(crudo["base"]["tamano"]),
            float(crudo["base"]["solapamiento_pct"]),
            crudo["base"]["estrategia"],
        ),
    )


class PruebasChunking:
    """T2–T4: mide variantes de chunking con el embedder ganador (vectores cacheados por variante)."""

    def __init__(
        self,
        config: ConfigA2,
        dataset: Dataset,
        secciones: dict[str, Sequence[Seccion]],
        fabrica: Fabrica,
        dir_onnx: Path,
        dir_vectores: Path,
        reloj: Callable[[], float],
    ) -> None:
        self.config = config
        self.dataset = dataset
        self.secciones = secciones
        self.embedder = fabrica.embedder(
            config.spec, dir_onnx, config.cuantizacion, config.hilos_cpu
        )
        self.tokenizador = fabrica.tokenizador(config.spec, dir_onnx)
        self.dir_vectores = dir_vectores
        self.reloj = reloj

    def vectores_de(self, variante: Variante, chunks: Sequence[ChunkCandidato]) -> np.ndarray:
        ruta = (
            self.dir_vectores
            / f"{self.config.spec.clave}-{self.config.cuantizacion}-{variante.etiqueta}.npy"
        )
        return vectores_en_cache(ruta, [c.texto for c in chunks], self.embedder)

    def medir(self, variante: Variante) -> dict[str, Any]:
        inicio = self.reloj()
        chunks = construir_corpus(self.secciones, self.tokenizador, variante)
        vectores = self.vectores_de(variante, chunks)
        rankings = recuperar_densos(self.embedder, vectores, self.dataset.preguntas, self.config.k)
        resultados = evaluar_rankings(self.dataset.preguntas, rankings, chunks, self.config.k)
        metricas = agregar(
            resultados,
            self.config.semilla_bootstrap,
            self.config.bootstrap_repeticiones,
            escala_puntaje=ESCALA_COSENO,
        )
        return {
            "variante": variante.etiqueta,
            "tamano": variante.tamano,
            "solapamiento_pct": variante.solapamiento_pct,
            "estrategia": variante.estrategia,
            "numero_chunks": len(chunks),
            "memoria_indice_flat_bytes_estimada": estimar_bytes_indice(
                "FLAT", {}, len(chunks), int(vectores.shape[1])
            ),
            "tokens_por_chunk_mediana": mediana([c.tokens for c in chunks]),
            "segundos": self.reloj() - inicio,
            "metricas": metricas,
        }

    def prueba(self, variantes: Sequence[Variante]) -> dict[str, Any]:
        admitidas, omitidas = variantes_admitidas(variantes, self.tokenizador)
        medidas = [self.medir(v) for v in admitidas]
        elegida = seleccionar_variante(
            [
                MedicionVariante(
                    m["variante"],
                    m["metricas"]["total"].recall_at_10,
                    m["numero_chunks"],
                    _simplicidad(m),
                )
                for m in medidas
            ],
            self.config.chunk_selection_margin,
        )
        mejor = max(medidas, key=lambda m: m["metricas"]["total"].recall_at_10)
        ganadora = next(m for m in medidas if m["variante"] == elegida.variante)
        ic = ganadora["metricas"]["total"]
        return {
            "variantes": medidas,
            "omitidas": omitidas,
            "elegida": elegida.variante,
            "criterio": _criterio(ganadora, mejor, self.config.chunk_selection_margin),
            "mejor_recall_dentro_del_ic_de_la_elegida": bool(
                ic.recall_ic95[0] <= mejor["metricas"]["total"].recall_at_10 <= ic.recall_ic95[1]
            ),
        }


def _simplicidad(medida: dict[str, Any]) -> int:
    return int(medida["estrategia"] != ESTRATEGIA_TAMANO_FIJO) + int(medida["solapamiento_pct"] > 0)


def _criterio(ganadora: dict[str, Any], mejor: dict[str, Any], margen: float) -> str:
    if ganadora["variante"] == mejor["variante"]:
        return (
            "mayor recall@10 y supera el margen frente a la variante más barata, o es la más barata"
        )
    return f"la mejora de recall@10 no supera CHUNK_SELECTION_MARGIN ({margen}); gana la de menos chunks"


def prueba_indice(
    config: ConfigA2,
    comparador: ComparadorIndices,
    chunks: Sequence[ChunkCandidato],
    vectores: np.ndarray,
    dataset: Dataset,
    consultas: np.ndarray,
) -> dict[str, Any]:
    """T5: HNSW frente a FLAT sobre los chunks del ganador; recall@10 respecto a FLAT y p95 de consulta."""
    por_tipo: dict[str, Any] = {}
    flat_ids: list[list[int]] = []
    for tipo in config.indices:
        parametros = {
            "construccion": parametros_de_construccion(tipo, config.parametros_hnsw),
            "busqueda": parametros_de_busqueda(tipo, config.parametros_hnsw),
        }
        pasadas = [
            comparador.evaluar(vectores, consultas, tipo, parametros, config.k)
            for _ in range(config.consultas_latencia_indice)
        ]
        primera = pasadas[0]
        if tipo == "FLAT":
            flat_ids = primera.top_ids
        rankings = {
            p.id: list(zip(primera.top_ids[i], primera.top_puntajes[i]))
            for i, p in enumerate(dataset.preguntas)
        }
        resultados = evaluar_rankings(dataset.preguntas, rankings, chunks, config.k)
        todas = [t for p in pasadas for t in p.latencias_ms]
        por_tipo[tipo] = {
            "parametros": parametros,
            "metricas": agregar(
                resultados,
                config.semilla_bootstrap,
                config.bootstrap_repeticiones,
                escala_puntaje=ESCALA_COSENO,
            ),
            "p50_ms": mediana(todas),
            "p95_ms": percentil_95(todas),
            "memoria_estimada_bytes": estimar_bytes_indice(
                tipo, config.parametros_hnsw, len(chunks), int(vectores.shape[1])
            ),
            "top_ids": primera.top_ids,
        }
    for tipo, datos in por_tipo.items():
        datos["recall_vs_flat"] = (
            recall_frente_a_flat(datos["top_ids"], flat_ids, config.k) if flat_ids else None
        )
        del datos["top_ids"]
    hnsw = por_tipo.get("HNSW")
    decision = (
        "HNSW"
        if hnsw
        and hnsw["recall_vs_flat"] is not None
        and hnsw["recall_vs_flat"] >= config.index_min_recall_vs_flat
        else "FLAT"
    )
    return {
        "indices": por_tipo,
        "numero_chunks": len(chunks),
        "elegido": decision,
        "criterio": f"HNSW solo si recall@10 frente a FLAT >= INDEX_MIN_RECALL_VS_FLAT ({config.index_min_recall_vs_flat})",
        "nota": "con el tamaño del corpus semilla HNSW y FLAT no discriminan; T5 solo verifica que HNSW no pierde recall, no mide calidad",
    }


def _leer_reporte(ruta: Path) -> dict[str, Any]:
    return (
        json.loads(ruta.read_text(encoding="utf-8"))
        if ruta.exists()
        else {"fase": "A2", "etapas": {}}
    )


def _variantes_de_la_etapa(etapa: str, config: ConfigA2, previas: dict[str, Any]) -> list[Variante]:
    def ganadora(prueba: str) -> Variante:
        elegida = previas[prueba]["elegida"]
        medida = next(m for m in previas[prueba]["variantes"] if m["variante"] == elegida)
        return Variante(medida["tamano"], medida["solapamiento_pct"], medida["estrategia"])

    if etapa == "t2":
        return [
            Variante(t, config.base.solapamiento_pct, ESTRATEGIA_TAMANO_FIJO)
            for t in config.tamanos
        ]
    if etapa == "t3":
        base = ganadora("t2")
        return [Variante(base.tamano, p, base.estrategia) for p in config.solapamientos]
    base = ganadora("t3")
    return [Variante(base.tamano, base.solapamiento_pct, e) for e in config.estrategias]


def ejecutar_etapa_con_puertos(
    etapa: str,
    config: ConfigA2,
    dataset: Dataset,
    secciones: dict[str, Sequence[Seccion]],
    fabrica: Fabrica,
    dir_onnx: Path,
    dir_vectores: Path,
    ruta_reporte: Path,
    comparador: ComparadorIndices | None,
    reloj: Callable[[], float],
    ahora: Callable[[], datetime],
) -> int:
    reporte = _leer_reporte(ruta_reporte)
    previas = reporte["etapas"]
    requeridas = {"t3": ["t2"], "t4": ["t2", "t3"], "t5": ["t2", "t3", "t4"]}.get(etapa, [])
    faltan = [r for r in requeridas if r not in previas]
    if faltan:
        print(
            f"falta ejecutar {', '.join(faltan)} antes de {etapa} (cada prueba fija el ganador de la anterior)",
            file=sys.stderr,
        )
        return SALIDA_PREVIA
    pruebas = PruebasChunking(config, dataset, secciones, fabrica, dir_onnx, dir_vectores, reloj)
    if etapa in ("t2", "t3", "t4"):
        previas[etapa] = pruebas.prueba(_variantes_de_la_etapa(etapa, config, previas))
    else:
        assert comparador is not None
        ganadora = _variantes_de_la_etapa(
            "t4", config, previas
        )  # solo para localizar la variante final de T4
        elegida_t4 = previas["t4"]["elegida"]
        variante = next(v for v in ganadora if v.etiqueta == elegida_t4)
        chunks = construir_corpus(secciones, pruebas.tokenizador, variante)
        vectores = pruebas.vectores_de(variante, chunks)  # misma caché de vectores que T2–T4
        consultas = pruebas.embedder.codificar([p.texto for p in dataset.preguntas], consulta=True)
        previas["t5"] = prueba_indice(config, comparador, chunks, vectores, dataset, consultas)
        previas["t5"]["variante"] = variante.etiqueta
    reporte.update(
        {
            "fase": "A2",
            "fecha": ahora().date().isoformat(),
            "embedding": {
                "modelo": config.spec.modelo,
                "revision": config.spec.revision,
                "cuantizacion": config.cuantizacion,
            },
            "dataset": {"nombre": dataset.nombre, "version": dataset.version},
            "chunk_selection_margin": config.chunk_selection_margin,
            "index_min_recall_vs_flat": config.index_min_recall_vs_flat,
        }
    )
    escribir_reporte(ruta_reporte, reporte)
    print(f"{etapa} → {ruta_reporte}")
    return SALIDA_OK
