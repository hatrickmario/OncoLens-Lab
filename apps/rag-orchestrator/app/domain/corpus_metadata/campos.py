"""Campos de metadatos que la ingesta puede escribir en ``corpus_document`` (FR-19, D7, ``[S3 resp. 16]``).

Las claves de ``population_criteria`` son las del modelo v1.1 (``CRITERIOS_DE_POBLACION``) y las subclaves de
``biomarcadores`` que el catálogo de aplicabilidad nombra en ``studyKey`` (``biomarcadores.her2``, ...). Si ``l1d-126``
cambia un ``studyKey``, el ajuste es de datos (esta tupla y el fixture), no de lógica.
"""

from __future__ import annotations

from typing import Final

from app.domain.corpus_seed.poblacion import CRITERIOS_DE_POBLACION

CAMPOS_ESCALARES: Final = ("study_design", "trial_phase", "sample_size", "primary_endpoint")
DISENOS_EXTRAIBLES: Final = ("guia", "eca", "observacional", "revision_sistematica")
FASES_DE_ENSAYO: Final = ("I", "II", "III", "IV")
DISENO_NO_DECLARADO: Final = "otro"

CRITERIOS_PLANOS: Final = tuple(c for c in CRITERIOS_DE_POBLACION if c != "biomarcadores")
SUBCLAVES_DE_BIOMARCADORES: Final = ("her2", "receptores_hormonales", "hrr_brca")
# Tope de caracteres de un valor propuesto por el LLM (esquema JSON y Pydantic): un valor largo no entra al catálogo.
LONGITUD_MAXIMA_DE_VALOR: Final = 200


def claves_de_poblacion_admitidas() -> frozenset[str]:
    """Toda clave que la ingesta puede escribir: las planas y ``biomarcadores.<subclave>`` (formato de ``studyKey``)."""
    return frozenset(
        (*CRITERIOS_PLANOS, *(f"biomarcadores.{s}" for s in SUBCLAVES_DE_BIOMARCADORES))
    )
