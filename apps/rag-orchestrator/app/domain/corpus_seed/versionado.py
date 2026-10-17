"""Versionado e idempotencia del corpus por ``checksum`` (RN-05, US-059 D5)."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class VersionExistente:
    """Una versión ya registrada en el grupo (``version_group_id``) de un documento entrante."""

    document_id: str
    checksum: str
    is_current: bool
    status: str
