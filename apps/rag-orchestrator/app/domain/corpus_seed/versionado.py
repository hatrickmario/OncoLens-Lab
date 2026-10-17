"""Versionado e idempotencia del corpus por ``checksum`` (RN-05, US-059 D5)."""

from __future__ import annotations

import hashlib
from collections.abc import Collection, Sequence
from dataclasses import dataclass
from enum import StrEnum

STATUS_EMBEBIDO = "embebido"


def calcular_checksum(texto_normalizado: str) -> str:
    """SHA-256 hexadecimal del texto YA normalizado: el mismo texto da siempre el mismo checksum."""
    return hashlib.sha256(texto_normalizado.encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class VersionExistente:
    """Una versión ya registrada en el grupo (``version_group_id``) de un documento entrante."""

    document_id: str
    checksum: str
    is_current: bool
    status: str


class Accion(StrEnum):
    INSERTAR = "insertar"
    OMITIR = "omitir"
    REEMPLAZAR = "reemplazar"


@dataclass(frozen=True)
class DecisionDeVersion:
    accion: Accion
    anterior_id: str | None = None


def decidir_version(checksum: str, existentes: Sequence[VersionExistente]) -> DecisionDeVersion:
    """Qué hacer con un documento entrante frente a las versiones de su grupo.

    Solo cuentan las versiones ``embebido``: una ``error`` se reintenta y una ``rechazado_licencia`` no es versión.
    """
    embebidas = [v for v in existentes if v.status == STATUS_EMBEBIDO]
    if any(v.checksum == checksum for v in embebidas):
        return DecisionDeVersion(Accion.OMITIR)
    return DecisionDeVersion(Accion.INSERTAR)


def debe_publicar_release(vigentes: Collection[str], ultima: Collection[str] | None) -> bool:
    """Una release nueva solo si el conjunto de documentos vigentes cambió respecto de la última (AC-5)."""
    return bool(vigentes) and set(vigentes) != set(ultima or ())
