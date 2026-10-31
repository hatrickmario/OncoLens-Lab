"""Único punto desde el que una herramienta de línea de comandos toma el entorno del proceso (US-037 AC-1, RN-22).

``evaluate`` recibe el entorno por parámetro (los tests le pasan uno controlado); ``python -m app.evaluation.evaluate``
lo toma de aquí para encontrar las rutas y los SHA-256 de los pesos locales.
"""

from __future__ import annotations

import os
from collections.abc import Mapping


def entorno_del_proceso() -> Mapping[str, str]:
    return dict(os.environ)
