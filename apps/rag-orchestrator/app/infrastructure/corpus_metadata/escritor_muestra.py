"""Escritor YAML de la muestra de metadatos (US-118 AC-5, D5)."""

from __future__ import annotations

from collections.abc import Mapping
from pathlib import Path
from typing import Any


class EscritorDeMuestraYaml:
    """Escribe ``<directorio>/<release>.yaml``. El directorio es configuración (``CORPUS_METADATA_SAMPLE_DIR``)."""

    def __init__(self, directorio: Path) -> None:
        self._directorio = directorio

    def escribir(self, release_id: str, contenido: Mapping[str, Any]) -> Path:
        raise NotImplementedError("no implementado")
