"""``SourceFetcher`` del manifiesto: texto inline (fixtures), archivo junto al manifiesto o URL de un host permitido."""

from __future__ import annotations

from pathlib import Path

from app.domain.corpus_seed.documento import DocumentoDeSemilla
from app.infrastructure.fetch.http_source_fetcher import HttpSourceFetcher


class RutaFueraDelManifiesto(ValueError):
    """``text_path`` sale del directorio del manifiesto (``..`` o ruta absoluta)."""


class FuenteDeTextoDelManifiesto:
    def __init__(self, directorio_base: Path, descargador: HttpSourceFetcher | None) -> None:
        self._base = directorio_base.resolve()
        self._descargador = descargador

    def obtener_texto(self, documento: DocumentoDeSemilla) -> str:
        if documento.texto is not None:
            return documento.texto
        if documento.ruta_texto is not None:
            return self._leer_archivo(documento.ruta_texto)
        if documento.url_fuente is not None and self._descargador is not None:
            return self._descargador.descargar_texto(documento.url_fuente)
        raise RuntimeError(f"{documento.document_key}: no hay de dónde obtener el texto")

    def _leer_archivo(self, ruta_relativa: str) -> str:
        ruta = (self._base / ruta_relativa).resolve()
        if not ruta.is_relative_to(self._base):
            raise RutaFueraDelManifiesto(ruta_relativa)
        return ruta.read_text(encoding="utf-8")
