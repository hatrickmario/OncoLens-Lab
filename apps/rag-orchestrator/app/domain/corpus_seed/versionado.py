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
    # Versiones del grupo cuyos chunks deben quedar no vigentes en Milvus (RN-05); la decide el dominio.
    a_apagar: tuple[str, ...] = ()


def decidir_version(checksum: str, existentes: Sequence[VersionExistente]) -> DecisionDeVersion:
    """Qué hacer con un documento entrante frente a las versiones de su grupo y qué chunks apagar (RN-05).

    Solo cuentan como versión las ``embebido``: una ``error`` se reintenta y una ``rechazado_licencia`` no es versión.
    ``a_apagar`` reúne la vigente anterior (si se reemplaza) y TODA versión del grupo que no esté ``embebido`` y sea de otro
    contenido: un fallo previo pudo dejar sus chunks vigentes en Milvus, y el catálogo no los refleja.
    """
    embebidas = [v for v in existentes if v.status == STATUS_EMBEBIDO]
    huerfanas = tuple(
        v.document_id for v in existentes if v.status != STATUS_EMBEBIDO and v.checksum != checksum
    )
    if any(v.checksum == checksum for v in embebidas):
        return DecisionDeVersion(Accion.OMITIR, a_apagar=huerfanas)
    vigente = next((v for v in embebidas if v.is_current), None)
    if vigente is not None:
        return DecisionDeVersion(
            Accion.REEMPLAZAR, vigente.document_id, a_apagar=(vigente.document_id, *huerfanas)
        )
    return DecisionDeVersion(Accion.INSERTAR, a_apagar=huerfanas)


def debe_publicar_release(vigentes: Collection[str], ultima: Collection[str] | None) -> bool:
    """Una release nueva solo si el conjunto de documentos vigentes cambió respecto de la última (AC-5)."""
    return bool(vigentes) and set(vigentes) != set(ultima or ())
