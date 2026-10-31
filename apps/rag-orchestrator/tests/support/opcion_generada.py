"""Opciones generadas de prueba por el camino único de la generación real: afirmaciones atómicas con marco (US-245)."""

from __future__ import annotations

from collections.abc import Sequence

from app.domain.atribucion import componer_con_marco
from app.domain.citations import OpcionGenerada
from app.domain.claims import AfirmacionAtomica, PapelDeAfirmacion


def opcion_con_afirmaciones(
    option: str, afirmaciones: Sequence[AfirmacionAtomica], idioma: str = "es"
) -> OpcionGenerada:
    """La opción como la entrega ``LlmEvidenceGenerator``: justificación y detalles compuestos con el marco."""
    composicion = componer_con_marco(afirmaciones, idioma)
    citas = tuple(dict.fromkeys(c for a in afirmaciones for c in a.chunk_ids))
    return OpcionGenerada(
        option, composicion.rationale, citas, composicion.details, tuple(afirmaciones)
    )


def opcion_atomica(
    option: str, razon: str, citas: tuple[str, ...], idioma: str = "es"
) -> OpcionGenerada:
    """Una opción cuya propuesta cruda es UNA afirmación principal con las citas dadas."""
    return opcion_con_afirmaciones(
        option, (AfirmacionAtomica(razon, PapelDeAfirmacion.principal, citas),), idioma
    )
