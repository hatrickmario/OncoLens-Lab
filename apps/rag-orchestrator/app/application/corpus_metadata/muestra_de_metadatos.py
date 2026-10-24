"""Muestra de metadatos extraídos para revisión humana (US-118 AC-5, TBD-20, M-08.4).

Al publicar una ``CorpusRelease`` se eligen, de forma determinista, ``ceil(N * pct / 100)`` de los documentos
``extraido_verificado`` y se escribe un archivo con cada metadato en ``revision = pendiente``. La revisión es humana
(``[S3 resp. 13]``): nada de este módulo marca un campo como correcto o incorrecto.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

from app.application.corpus_ingestion.reporte import ReporteDeIngesta, ResultadoDeIngesta
from app.application.ports import Clock
from app.domain.corpus_metadata.muestra import seleccionar_muestra
from app.domain.corpus_metadata.resultado import EXTRAIDO_VERIFICADO
from app.domain.corpus_seed.documento import DocumentoDeSemilla
from app.domain.corpus_seed.poblacion import NO_DISPONIBLE

REVISION_PENDIENTE = "pendiente"


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
        elegibles = [r for r in reporte.resultados if _es_extraido_con_campos(r)]
        if reporte.release_id is None or not elegibles:
            return ResultadoDeMuestra(0, None)
        elegidos = seleccionar_muestra(
            [r.document_id for r in elegibles if r.document_id], self._pct, self._semilla
        )
        if not elegidos:
            return ResultadoDeMuestra(0, None)
        por_id = {r.document_id: r for r in elegibles}
        fuentes = {d.document_key: d for d in documentos}
        entradas = [_entrada(por_id[i], fuentes[por_id[i].document_key]) for i in elegidos]
        archivo = self._escritor.escribir(
            reporte.release_id, {**self._cabecera(reporte.release_id), "documentos": entradas}
        )
        return ResultadoDeMuestra(len(entradas), archivo)

    def _cabecera(self, release_id: str) -> dict[str, Any]:
        return {
            "release": release_id,
            "prompt_version": self._prompt_version,
            "llm_model": self._llm_model,
            "nli_model": self._nli_model,
            "seed": self._semilla,
            "pct": self._pct,
            "generated_at": self._reloj.ahora().isoformat(),
        }


def _es_extraido_con_campos(resultado: ResultadoDeIngesta) -> bool:
    """Solo se revisa lo que la extracción conservó: un documento ``extraido_verificado`` sin campos no tiene nada que revisar."""
    metadatos = resultado.metadatos
    return bool(
        metadatos
        and metadatos.metadata_source == EXTRAIDO_VERIFICADO
        and metadatos.campos_verificados
    )


def _entrada(resultado: ResultadoDeIngesta, documento: DocumentoDeSemilla) -> dict[str, Any]:
    """Datos de la fuente copiados del manifiesto (RN-04, RN-25); la URL ausente se informa como "No disponible"."""
    campos = resultado.metadatos.campos_verificados if resultado.metadatos else ()
    return {
        "document_id": resultado.document_id,
        "source_name": documento.source_name,
        "external_id": documento.external_id,
        "source_url": documento.url_original or NO_DISPONIBLE,
        "campos": [
            {"campo": c.campo, "valor": str(c.valor), "revision": REVISION_PENDIENTE, "nota": ""}
            for c in campos
        ],
    }
