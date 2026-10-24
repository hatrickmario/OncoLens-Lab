"""Verbalización determinista de un metadato como hipótesis para el NLI (ADR-34)."""

from __future__ import annotations


def verbalizar_metadato(campo: str, valor: object) -> str:
    """Hipótesis en español para ``campo`` (``study_design``, ``estadio``, ``biomarcadores.her2``, ...) y su ``valor``."""
    raise NotImplementedError("no implementado")
