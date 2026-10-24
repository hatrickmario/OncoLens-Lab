"""Escritor YAML de la muestra de metadatos (US-118 AC-5, D5)."""

from __future__ import annotations

import errno
import os
import re
from collections.abc import Mapping
from pathlib import Path
from typing import Any

import yaml

_RELEASE_SEGURO = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]*")


class ReleaseNoSeguraComoNombreDeArchivo(ValueError):
    """El id de la release no puede ser un nombre de archivo (separadores de ruta, ``..``): no se escribe fuera del directorio."""


class ArchivoDeMuestraEsUnEnlace(OSError):
    """El archivo de destino es un enlace simbólico: no se sigue ni se escribe a través de él."""


class EscritorDeMuestraYaml:
    """Escribe ``<directorio>/<release>.yaml``. El directorio es configuración (``CORPUS_METADATA_SAMPLE_DIR``)."""

    def __init__(self, directorio: Path) -> None:
        self._directorio = directorio

    def escribir(self, release_id: str, contenido: Mapping[str, Any]) -> Path:
        if not _RELEASE_SEGURO.fullmatch(release_id):
            raise ReleaseNoSeguraComoNombreDeArchivo()
        self._directorio.mkdir(parents=True, exist_ok=True)
        archivo = self._directorio / f"{release_id}.yaml"
        texto = yaml.safe_dump(dict(contenido), allow_unicode=True, sort_keys=False)
        _escribir_sin_seguir_enlaces(archivo, texto)
        return archivo


def _escribir_sin_seguir_enlaces(archivo: Path, texto: str) -> None:
    """``O_NOFOLLOW``: un enlace simbólico puesto en el lugar del archivo no redirige la escritura fuera del directorio."""
    try:
        descriptor = os.open(archivo, os.O_WRONLY | os.O_CREAT | os.O_TRUNC | os.O_NOFOLLOW, 0o644)
    except OSError as error:
        if error.errno in (errno.ELOOP, errno.EMLINK):
            raise ArchivoDeMuestraEsUnEnlace() from None
        raise
    with os.fdopen(descriptor, "w", encoding="utf-8") as salida:
        salida.write(texto)
