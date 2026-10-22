"""Generador de ids del arnés de pruebas (borde de los tests; el dominio no lo usa)."""

from __future__ import annotations

import uuid


def nuevo_sufijo() -> str:
    """10 caracteres hexadecimales para nombrar bases, colecciones y tablas de test."""
    return uuid.uuid4().hex[:10]
