"""``structuredState.ultimaEvidencia`` de un turno que recupera (US-265, design D2b): regla pura, sin E/S.

Resume lo recuperado para que el siguiente turno (y ``fuentes_limitaciones``, L1D-323) sepa qué se evaluó, sin guardar el
texto de ningún fragmento y **sin ningún identificador de Backend 1**: ``analysisId`` y ``activeAnalysisId`` no tienen
campo aquí (Backend 2 nunca los conoce).
"""

from __future__ import annotations

from collections.abc import Sequence

from app.domain.chat.estado import UltimaEvidencia


def resumir_ultima_evidencia(
    pregunta: str, chunk_ids_evaluados: Sequence[str], top_relevance_score: float | None
) -> UltimaEvidencia:
    """La pregunta enmascarada del turno, los ``chunkId`` que evaluó el *reranker* (en su orden) y el mayor
    ``relevance_score`` sobre el umbral; ``None`` si ningún chunk lo superó (RN-02: ``None`` ≠ ``0.0``)."""
    return UltimaEvidencia(
        query=pregunta,
        chunk_ids=tuple(chunk_ids_evaluados),
        top_relevance_score=top_relevance_score,
    )
