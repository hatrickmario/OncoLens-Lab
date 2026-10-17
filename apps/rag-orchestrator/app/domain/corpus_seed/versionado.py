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
    vigente = next((v for v in embebidas if v.is_current), None)
    # Regla real: con una versión vigente en el grupo, un checksum ya embebido se omite (la vigente, o una antigua que no se
    # resucita). SIN vigente en el grupo, cualquier versión embebida con ese checksum se reingiere: también una reemplazada
    # cuya sucesora se retiró (v1 -> v2 -> v2 rechazada por ND -> vuelve v1 = v1 vigente). Si el usuario prefiere otra regla,
    # se cambia aquí.
    if any(v.checksum == checksum and (v.is_current or vigente is not None) for v in embebidas):
        return DecisionDeVersion(Accion.OMITIR, a_apagar=huerfanas)
    if vigente is not None:
        return DecisionDeVersion(
            Accion.REEMPLAZAR, vigente.document_id, a_apagar=(vigente.document_id, *huerfanas)
        )
    return DecisionDeVersion(Accion.INSERTAR, a_apagar=huerfanas)


@dataclass(frozen=True)
class DecisionDeRetiro:
    """Qué retirar cuando un documento del grupo se rechaza por licencia o fuente (RN-21, RN-05)."""

    vigente_id: str | None = None
    a_apagar: tuple[str, ...] = ()


def decidir_retiro(existentes: Sequence[VersionExistente]) -> DecisionDeRetiro:
    """La versión vigente del grupo y los chunks a apagar: la vigente más toda versión no ``embebido`` (ver ``decidir_version``)."""
    vigente = next((v for v in existentes if v.status == STATUS_EMBEBIDO and v.is_current), None)
    huerfanas = tuple(v.document_id for v in existentes if v.status != STATUS_EMBEBIDO)
    if vigente is None:
        return DecisionDeRetiro(None, huerfanas)
    return DecisionDeRetiro(vigente.document_id, (vigente.document_id, *huerfanas))


def debe_publicar_release(vigentes: Collection[str], ultima: Collection[str] | None) -> bool:
    """Una release nueva solo si el conjunto de documentos vigentes cambió respecto de la última (AC-5).

    Incluye quedar sin vigentes tras un retiro (la última release no debe seguir listando lo retirado); sin release previa y
    sin vigentes no hay nada que publicar.
    """
    return set(vigentes) != set(ultima or ())
