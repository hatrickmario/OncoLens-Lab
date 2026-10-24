"""Escritor YAML de la muestra de metadatos (US-118 AC-5, D5)."""

from __future__ import annotations

import re
from collections.abc import Mapping
from pathlib import Path
from typing import Any

import yaml

_RELEASE_SEGURO = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]*")


class ReleaseNoSeguraComoNombreDeArchivo(ValueError):
    """El id de la release no puede ser un nombre de archivo (separadores de ruta, ``..``): no se escribe fuera del directorio."""


class EscritorDeMuestraYaml:
    """Escribe ``<directorio>/<release>.yaml``. El directorio es configuración (``CORPUS_METADATA_SAMPLE_DIR``)."""

    def __init__(self, directorio: Path) -> None:
        self._directorio = directorio

    def escribir(self, release_id: str, contenido: Mapping[str, Any]) -> Path:
        if not _RELEASE_SEGURO.fullmatch(release_id):
            raise ReleaseNoSeguraComoNombreDeArchivo()
        self._directorio.mkdir(parents=True, exist_ok=True)
        archivo = self._directorio / f"{release_id}.yaml"
        archivo.write_text(
            yaml.safe_dump(dict(contenido), allow_unicode=True, sort_keys=False), encoding="utf-8"
        )
        return archivo
