"""Errores de dominio compartidos por el cargador de la semilla y la ingesta en lote.

Su clase aparece en el motivo del resultado (``<etapa>: <clase>``): por eso el nombre es parte del contrato del reporte.
"""

from __future__ import annotations


class ChecksumDelManifiestoNoCoincide(Exception):
    """El texto leído no es el que el manifiesto declaró (``checksum``): se alteró o es otra versión."""


class TextoVacio(Exception):
    """El documento no tiene texto que indexar tras normalizarlo."""
