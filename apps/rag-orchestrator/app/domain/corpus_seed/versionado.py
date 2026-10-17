"""Versionado e idempotencia del corpus por ``checksum`` (RN-05, US-059 D5)."""

from __future__ import annotations

import hashlib
from dataclasses import dataclass


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
