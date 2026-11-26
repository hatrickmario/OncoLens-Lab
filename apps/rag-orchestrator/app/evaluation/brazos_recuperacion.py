"""Reglas puras de la comparación de brazos de recuperación (US-133, ADR-45 P1): sin E/S, sin reloj, sin azar.

Un brazo es una configuración de recuperación (``RETRIEVAL_MODE``, ``RETRIEVAL_FUSION``, ``RRF_K``,
``HYBRID_SPARSE_WEIGHT``); el brazo de referencia (A0, *dense*) se mide en la misma corrida que los demás, de modo que la
diferencia solo se atribuye al modo de recuperación. ``None`` significa «no medible» y NUNCA se trata como ``0.0``.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass

from app.domain.fusion_de_candidatos import EstrategiaDeFusion
from app.domain.ventanas_del_reranker import ModoDeVentanas
from app.schemas.generated.models import Fusion, RetrievalMode

REFERENCIA = "A0"
"""Nombre del brazo de referencia: el primero de la configuración y siempre *dense*."""


@dataclass(frozen=True)
class Brazo:
    nombre: str
    modo: RetrievalMode
    fusion: EstrategiaDeFusion | None = None
    rrf_k: int | None = None
    peso_sparse: float | None = None
    reranker_modo: ModoDeVentanas | None = None
    """``RERANKER_CHUNK_WINDOWS`` del brazo (US-278); ``None`` = el del reranker de la suite."""
    reranker_solape: int | None = None
    """``RERANKER_WINDOW_OVERLAP`` del brazo; ``None`` = el del reranker de la suite."""
    reranker_max_length: int | None = None
    """``RERANKER_MAX_LENGTH`` del brazo; ``None`` = el del reranker de la suite."""
    coleccion: str | None = None
    """Colección de Milvus que lee el brazo (el de chunks de 512 tokens, US-278 AC-4); ``None`` = la de la suite."""
    reranker_max_pairs: int | None = None
    """``RERANKER_MAX_PAIRS`` del brazo (US-277 AC-6): los candidatos que llegan al reranker; ``None`` = el de la suite."""
    query_rewrite_enabled: bool | None = None
    """``QUERY_REWRITE_ENABLED`` del brazo (US-277 AC-2, AC-5): el segundo loop de reescritura; ``None`` = el de la suite."""

    @property
    def cambia_el_reranker(self) -> bool:
        return (self.reranker_modo, self.reranker_solape, self.reranker_max_length) != (
            None,
            None,
            None,
        )

    def trazado_esperado(self) -> tuple[RetrievalMode, Fusion, float]:
        """``(retrievalMode, fusion, fusionParam)`` que ``meta.retrievalParams`` debe traer, sin nulos (l1d-109 D7)."""
        if self.modo is RetrievalMode.dense:
            return RetrievalMode.dense, Fusion.ninguna, 0
        if self.fusion is EstrategiaDeFusion.rrf and self.rrf_k is not None:
            return self.modo, Fusion.rrf, self.rrf_k
        if self.fusion is EstrategiaDeFusion.ponderada and self.peso_sparse is not None:
            return self.modo, Fusion.ponderada, self.peso_sparse
        raise ValueError("un brazo híbrido exige su fusión y el parámetro de esa fusión")

    def huella(self) -> str:
        """SHA-256 de la configuración del brazo, para que el reporte identifique qué se comparó."""
        # Los campos del reranker y del índice entran solo si el brazo los declara: la huella de A0, A2 y A2b no cambia.
        extras = {
            clave: valor
            for clave, valor in (
                ("reranker_modo", self.reranker_modo),
                ("reranker_solape", self.reranker_solape),
                ("reranker_max_length", self.reranker_max_length),
                ("indice", self.coleccion),
            )
            if valor is not None
        }
        canonico = json.dumps(
            {
                "nombre": self.nombre,
                "modo": self.modo.value,
                "fusion": None if self.fusion is None else self.fusion.value,
                "rrf_k": self.rrf_k,
                "peso_sparse": self.peso_sparse,
                **extras,
            },
            sort_keys=True,
            separators=(",", ":"),
        )
        return hashlib.sha256(canonico.encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class MetricasDeBrazo:
    """Las tres métricas que deciden el retroceso; ``None`` = sin preguntas con respuesta que medir."""

    recall_at_10_total: float | None
    recall_at_10_es_a_en: float | None
    mrr: float | None

    def como_tupla(self) -> tuple[float | None, float | None, float | None]:
        return self.recall_at_10_total, self.recall_at_10_es_a_en, self.mrr


def _restar(brazo: float | None, referencia: float | None) -> float | None:
    return None if brazo is None or referencia is None else brazo - referencia


def diferencia_frente_referencia(
    metricas_brazo: MetricasDeBrazo, metricas_a0: MetricasDeBrazo
) -> MetricasDeBrazo:
    """Brazo menos A0 por métrica, en puntos absolutos; si falta una de las dos, la diferencia es ``None``, no 0.0."""
    return MetricasDeBrazo(
        _restar(metricas_brazo.recall_at_10_total, metricas_a0.recall_at_10_total),
        _restar(metricas_brazo.recall_at_10_es_a_en, metricas_a0.recall_at_10_es_a_en),
        _restar(metricas_brazo.mrr, metricas_a0.mrr),
    )


def marcar_retroceso(diferencias: MetricasDeBrazo, tolerancia: float) -> bool:
    """``True`` si alguna diferencia es peor que ``-tolerancia``; una diferencia ``None`` no cuenta como retroceso."""
    if tolerancia < 0:
        raise ValueError("la tolerancia de retroceso no puede ser negativa")
    # round: 0.60 - 0.65 es -0.05000000000000004 en coma flotante y «igual a la tolerancia» no es retroceso
    return any(
        d is not None and round(d, 12) < -round(tolerancia, 12) for d in diferencias.como_tupla()
    )


def trazado_coherente(brazo: Brazo, modo: RetrievalMode, fusion: Fusion, parametro: float) -> bool:
    """El ``retrievalMode``, la ``fusion`` y el ``fusionParam`` de una consulta son los del brazo que la ejecutó."""
    return (modo, fusion, parametro) == brazo.trazado_esperado()
