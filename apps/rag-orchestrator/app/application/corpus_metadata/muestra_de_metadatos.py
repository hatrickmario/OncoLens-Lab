"""Muestra de metadatos extraídos para revisión humana (US-118 AC-5, TBD-20, M-08.4)."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

from app.application.corpus_ingestion.reporte import ReporteDeIngesta
from app.application.ports import Clock
from app.domain.corpus_seed.documento import DocumentoDeSemilla


class EscritorDeMuestra(Protocol):
    """Escribe el archivo de la muestra de una ``CorpusRelease`` y devuelve su ruta."""

    def escribir(self, release_id: str, contenido: Mapping[str, Any]) -> Path: ...


@dataclass(frozen=True)
class ResultadoDeMuestra:
    """Tamaño de la muestra y archivo escrito (``None`` si no había documentos extraídos)."""

    tamano: int
    archivo: Path | None


class GeneradorDeMuestraDeMetadatos:
    def __init__(
        self,
        *,
        pct: float,
        semilla: str,
        escritor: EscritorDeMuestra,
        reloj: Clock,
        prompt_version: str,
        llm_model: str,
        nli_model: str,
    ) -> None:
        self._pct = pct
        self._semilla = semilla
        self._escritor = escritor
        self._reloj = reloj
        self._prompt_version = prompt_version
        self._llm_model = llm_model
        self._nli_model = nli_model

    def generar(
        self, reporte: ReporteDeIngesta, documentos: Sequence[DocumentoDeSemilla]
    ) -> ResultadoDeMuestra:
        raise NotImplementedError("no implementado")
