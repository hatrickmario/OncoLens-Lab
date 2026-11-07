"""Texto de los bloques del turno de evidencia (US-265, RN-23, RN-28): reglas puras, sin E/S.

El código solo añade textos fijos (encabezado, criterio de orden, estados de aplicabilidad); las opciones y sus razones
llegan de ``/rag/query`` con soporte NLI y sin lenguaje prescriptivo, en el orden de RN-28. Un bloque por opción, cada uno
con SUS citas.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

from app.domain.chat.mensajes import (
    CAUSA_FALTA_EN_PACIENTE,
    ENCABEZADO_DE_OPCIONES,
    ESTADOS_DE_APLICABILIDAD,
    TITULO_DE_APLICABILIDAD,
    TITULO_DE_FALTANTES,
)


@dataclass(frozen=True)
class CriterioParaMostrar:
    """Un criterio de aplicabilidad tal como lo calculó ``/rag/query``: ``estado`` y ``causa`` (``unknownReason``)."""

    criterio: str
    estado: str
    causa: str | None = None


def _legible(criterio: str) -> str:
    return criterio.replace("_", " ")


def _estado_legible(criterio: CriterioParaMostrar) -> str:
    estado = ESTADOS_DE_APLICABILIDAD[criterio.estado]
    es_falta = criterio.estado == "desconocido" and criterio.causa == "falta_en_paciente"
    return f"{estado} ({CAUSA_FALTA_EN_PACIENTE})" if es_falta else estado


def texto_de_la_opcion(
    numero: int,
    total: int,
    nombre: str,
    razon: str,
    criterios: Sequence[CriterioParaMostrar],
) -> str:
    """Encabezado, la opción con su razón y, si hay, su aplicabilidad por criterio (Coincide / Parcial / No coincide /
    Desconocido, con «falta en el paciente» cuando la causa es el dato ausente)."""
    lineas = [f"{ENCABEZADO_DE_OPCIONES}: opción {numero} de {total}.", f"{nombre}. {razon}"]
    if criterios:
        detalle = "; ".join(f"{_legible(c.criterio)}: {_estado_legible(c)}" for c in criterios)
        lineas.append(f"{TITULO_DE_APLICABILIDAD}: {detalle}.")
    return "\n".join(lineas)


def texto_de_los_faltantes(criterios: Sequence[CriterioParaMostrar]) -> str | None:
    """Los criterios que quedaron Desconocidos por un dato que falta en el paciente, sin repetir; ``None`` si no hay."""
    faltantes = dict.fromkeys(
        _legible(c.criterio)
        for c in criterios
        if c.estado == "desconocido" and c.causa == "falta_en_paciente"
    )
    return f"{TITULO_DE_FALTANTES}: {', '.join(faltantes)}." if faltantes else None
