"""Muestra de metadatos extraídos para revisión humana (US-118 AC-5, TBD-20, M-08.4).

Al publicar una ``CorpusRelease`` se eligen, de forma determinista, ``ceil(N * pct / 100)`` de los documentos
``extraido_verificado`` y se escribe un archivo con cada metadato en ``revision = pendiente``. La revisión es humana
(``[S3 resp. 13]``): nada de este módulo marca un campo como correcto o incorrecto.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

from app.application.ports import Clock
from app.application.seed_corpus.ports import RegistroDeDocumento
from app.domain.corpus_metadata.muestra import seleccionar_muestra
from app.domain.corpus_metadata.extraccion import campos_conservados
from app.domain.corpus_metadata.resultado import CampoDeMetadato
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


class LectorDeDocumentosExtraidos(Protocol):
    """Lo único que la muestra pide al catálogo (``CorpusCatalog`` lo cumple)."""

    def documentos_extraidos_de_la_release(self, release_id: str) -> list[RegistroDeDocumento]: ...


class GeneradorDeMuestraDeMetadatos:
    """La fuente de la muestra es la RELEASE publicada (catálogo), no los resultados de la corrida: los documentos omitidos
    de corridas previas también se pueden muestrear. Decidido (usuario, 2026-10-24)."""

    def __init__(
        self,
        *,
        pct: float,
        semilla: str,
        escritor: EscritorDeMuestra,
        catalogo: LectorDeDocumentosExtraidos,
        reloj: Clock,
        prompt_version: str,
        llm_model: str,
        nli_model: str,
    ) -> None:
        self._pct = pct
        self._semilla = semilla
        self._escritor = escritor
        self._catalogo = catalogo
        self._reloj = reloj
        self._prompt_version = prompt_version
        self._llm_model = llm_model
        self._nli_model = nli_model

    def generar(self, release_id: str | None) -> ResultadoDeMuestra:
        """``release_id``: la release que publicó la ingesta (``None`` si no publicó ninguna: no hay muestra)."""
        if release_id is None:
            return ResultadoDeMuestra(0, None)
        elegibles = {
            r.document_id: (r, campos)
            for r in self._catalogo.documentos_extraidos_de_la_release(release_id)
            if (campos := _campos_de(r))
        }
        elegidos = seleccionar_muestra(list(elegibles), self._pct, self._semilla)
        if not elegidos:
            return ResultadoDeMuestra(0, None)
        entradas = [_entrada(*elegibles[i]) for i in elegidos]
        archivo = self._escritor.escribir(
            release_id, {**self._cabecera(release_id), "documentos": entradas}
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


def _campos_de(registro: RegistroDeDocumento) -> tuple[CampoDeMetadato, ...]:
    """Solo se revisa lo que el LLM extrajo y el NLI verificó (``extracted_fields``), no lo que el manifiesto declaraba.
    Decidido (usuario, 2026-10-24)."""
    extraidos = set(registro.extracted_fields)
    return tuple(
        c
        for c in campos_conservados(
            registro.study_design,
            registro.trial_phase,
            registro.sample_size,
            registro.primary_endpoint,
            registro.population_criteria,
        )
        if c.campo in extraidos
    )


def _entrada(registro: RegistroDeDocumento, campos: tuple[CampoDeMetadato, ...]) -> dict[str, Any]:
    """Datos de la fuente copiados del catálogo (RN-04, RN-25); la URL ausente se informa como "No disponible"."""
    return {
        "document_id": registro.document_id,
        "source_name": registro.source_name,
        "external_id": registro.external_id,
        "source_url": registro.source_url or NO_DISPONIBLE,
        "campos": [
            {"campo": c.campo, "valor": str(c.valor), "revision": REVISION_PENDIENTE, "nota": ""}
            for c in campos
        ],
    }
