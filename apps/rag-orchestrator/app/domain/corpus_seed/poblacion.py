"""Metadatos de población de un documento del corpus (RN-25, FR-19)."""

from __future__ import annotations

from collections.abc import Mapping

# Las seis claves de ``population_criteria`` (data-model §4.6).
CRITERIOS_DE_POBLACION = ("subtipo", "estadio", "linea", "biomarcadores", "edad", "ecog")
NO_DISPONIBLE = "no_disponible"


def resolver_criterios_poblacion(estructurados: Mapping[str, str] | None) -> dict[str, str]:
    """``population_criteria`` con las seis claves: lo que la fuente publica de forma estructurada o ``no_disponible``.

    En el S1 no hay extracción con LLM y nada se infiere del texto (RN-25): un criterio que la fuente no declara
    queda ``no_disponible``, nunca adivinado ni omitido.
    """
    declarados = estructurados or {}
    return {
        criterio: declarados.get(criterio) or NO_DISPONIBLE for criterio in CRITERIOS_DE_POBLACION
    }
