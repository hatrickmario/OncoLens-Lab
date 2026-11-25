"""Relación de un sinónimo con su término canónico (US-277, S-1): regla pura, sin E/S.

``RelacionDeSinonimo`` es el único dueño en Python de qué relaciones admite ``sinonimos.json``; el esquema JSON del catálogo
(``packages/clinical-catalogs``) y el lector de ``clinical-api`` declaran el mismo conjunto en su propio lenguaje.
"""

from __future__ import annotations

from enum import StrEnum


class RelacionDeSinonimo(StrEnum):
    """Dirección fija: ``mas_amplio`` nombra un concepto más amplio que el canónico; ``miembro_de_clase`` es un miembro de
    la clase que nombra el canónico."""

    equivalente = "equivalente"
    miembro_de_clase = "miembro_de_clase"
    mas_amplio = "mas_amplio"


def es_equivalente(relacion: RelacionDeSinonimo) -> bool:
    """S-1: solo un texto que nombra el mismo concepto que el canónico lo equipara; ante la duda no lo es."""
    return relacion is RelacionDeSinonimo.equivalente
