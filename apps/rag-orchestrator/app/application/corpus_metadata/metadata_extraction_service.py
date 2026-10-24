"""Paso de metadatos de la ingesta del corpus (US-118, FR-19, RN-25): fuente estructurada primero, extracción después.

Implementa el puerto ``ResolutorDeMetadatos`` de la ingesta. Solo depende de puertos (``LlmClient``, ``NliClassifier``);
nunca de ``httpx``, ``onnxruntime`` ni SQLAlchemy.
"""

from __future__ import annotations

from collections.abc import Sequence

from app.application.ports import LlmClient, NliClassifier
from app.domain.corpus_metadata.origen import (
    OrigenDeMetadatos,
    metadatos_de_la_fuente,
    origen_de_metadatos,
)
from app.domain.corpus_metadata.resultado import MetadatosResueltos
from app.domain.corpus_seed.documento import DocumentoDeSemilla


class MetadataExtractionService:
    def __init__(self, *, llm: LlmClient, nli: NliClassifier, umbral_nli: float) -> None:
        self._llm = llm
        self._nli = nli
        self._umbral_nli = umbral_nli

    def resolver(
        self, documento: DocumentoDeSemilla, texto: str, fragmentos: Sequence[str]
    ) -> MetadatosResueltos:
        if origen_de_metadatos(documento) is OrigenDeMetadatos.FUENTE_ESTRUCTURADA:
            return metadatos_de_la_fuente(documento)
        # Aún sin extracción (AC-2…AC-4, AC-6): se conserva lo que publica el manifiesto.
        return metadatos_de_la_fuente(documento)
