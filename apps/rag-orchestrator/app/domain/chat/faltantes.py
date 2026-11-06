"""Verbalización determinista del turno de faltantes (US-263, glosario S6 §3): reglas puras, sin E/S ni LLM.

Backend 1 es dueño de la clasificación (``gapType``, ``clasificarVacio``); aquí solo se convierte cada vacío en un bloque
``faltante`` con una plantilla fija. Las plantillas describen el vacío respecto de los documentos procesados, nunca una
afirmación sobre el paciente (nada de «ausente en el paciente»). Los bloques son deterministas (catálogo versionado),
sin citas ni ``factRefs``, y están exentos de cita (RN-01).
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass

from app.domain.chat.turno import BloqueDelTurno


@dataclass(frozen=True)
class ItemDeCompletitud:
    """Un dato esperado del caso tal como llega en ``completeness[]``: sin procedencia ni valores del paciente."""

    clave: str
    etiqueta: str
    estado: str
    tipo_de_vacio: str | None


def verbalizar_faltantes(
    items: Sequence[ItemDeCompletitud],
    tipos_de_documento: Mapping[str, tuple[str, ...]],
    version_del_catalogo: str,
) -> tuple[BloqueDelTurno, ...]:
    """Un bloque ``faltante`` por ítem con ``tipo_de_vacio`` no nulo (nunca un ``no_aplica``), en el orden del catálogo."""
    raise NotImplementedError("no implementado")
