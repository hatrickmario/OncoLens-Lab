"""Arma el reporte de la suite: agregados y configuración evaluada, nunca textos (RN-14)."""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from app.evaluation.config_suite import ConfigSuite
from app.evaluation.esquema_suite import VERSION_ESQUEMA
from app.evaluation.fuente_dataset import DatasetSuite
from app.evaluation.metricas.familias import calcular_familias
from app.evaluation.metricas.resultado import ResultadoConsulta
from app.schemas.generated.models import RagMeta


def configuracion_evaluada(
    config: ConfigSuite, dataset: DatasetSuite, meta: RagMeta
) -> dict[str, Any]:
    """La configuración con los modelos, el prompt y las versiones que respondieron (``meta``), no los deseados."""
    u = config.umbrales
    juez = config.juez
    return {
        **(
            {}
            if juez is None
            else {
                "juez": {
                    "proveedor": juez.proveedor,
                    "modelo": juez.modelo,
                    "temperatura": juez.temperatura,
                    "semilla": juez.semilla,
                }
            }
        ),
        "nombre": config.nombre,
        "hashConfig": config.hash_config,
        "fixture": config.fixture,
        "claseDataset": dataset.clase,
        "dataset": {"nombre": dataset.nombre, "version": dataset.version},
        "proveedor": config.proveedor,
        "reloj": config.reloj,
        "semillaBootstrap": config.semilla_bootstrap,
        "bootstrapRepeticiones": config.bootstrap_repeticiones,
        "modelos": {
            "embeddings": meta.embeddingModel,
            "reranker": meta.rerankerModel,
            "nli": meta.nliModel,
            "llm": meta.llmModel,
        },
        "promptVersion": meta.promptVersion,
        "umbrales": {
            "relevanceThreshold": u.relevance_threshold,
            "nliEntailmentThreshold": u.nli_entailment_threshold,
            "retrievalTopK": u.retrieval_top_k,
            "rerankTopN": u.rerank_top_n,
        },
        "corpusRelease": meta.corpusRelease,
        "catalogVersion": meta.catalogVersion,
    }


def _familias(
    resultados: Sequence[ResultadoConsulta], suite: str, config: ConfigSuite
) -> dict[str, Any]:
    return calcular_familias(
        resultados, suite, config.semilla_bootstrap, config.bootstrap_repeticiones
    )


def armar_reporte(
    config: ConfigSuite,
    dataset: DatasetSuite,
    suite: str,
    meta: RagMeta,
    resultados: Sequence[ResultadoConsulta],
    latencia_p95_ms: dict[str, float | None],
) -> dict[str, Any]:
    return {
        "esquema": VERSION_ESQUEMA,
        "suite": suite,
        "configuracion": configuracion_evaluada(config, dataset, meta),
        "metricas": {
            "completa": _familias(resultados, suite, config),
            "revisada": _familias([r for r in resultados if r.revisada], suite, config),
        },
        "latencia_p95_ms": latencia_p95_ms,
    }
