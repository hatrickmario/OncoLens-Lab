"""Regla pura de los metadatos de población versionados de la demo (L1D-297, US-247 AC-1 y AC-8, RN-25).

Un valor de población solo vale si dice de qué fragmento sale (``chunkId``) y si el NLI lo confirmó
(``nliResult = entailment``). Sin E/S: la usan el cargador de ``data/raw/seed/poblacion-verificada.json`` y el chequeo de la CI.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any, Final

METADATA_SOURCE_VERIFICADO: Final = "extraido_verificado"
NLI_QUE_SOPORTA: Final = "entailment"


def _valor_con_respaldo(valor: object) -> bool:
    return (
        isinstance(valor, Mapping)
        and isinstance(valor.get("chunkId"), str)
        and bool(valor["chunkId"])
        and valor.get("nliResult") == NLI_QUE_SOPORTA
    )


def criterios_sin_respaldo(population_criteria: Mapping[str, Any]) -> tuple[str, ...]:
    """Claves de los criterios con algún valor sin ``chunkId`` o sin ``nliResult = entailment``.

    ``{"status": "pendiente", "values": []}`` no guarda valores: no incumple. Devuelve solo claves, nunca el valor (RN-14)."""
    incumplen: list[str] = []
    for clave, contenido in population_criteria.items():
        if isinstance(contenido, Mapping):
            valores = contenido.get("values", [])
        else:
            valores = contenido
        if not isinstance(valores, list) or not all(_valor_con_respaldo(v) for v in valores):
            incumplen.append(clave)
    return tuple(incumplen)


def tiene_valores(population_criteria: Mapping[str, Any]) -> bool:
    """Algún criterio guarda al menos un valor (no es todo ``pendiente`` ni vacío)."""
    return any(isinstance(v, list) and v for v in population_criteria.values())
