"""Modelos que un runtime local ejecuta en la nube (RN-12): Ollama sirve ``x:cloud`` o ``x:1b-cloud`` desde localhost."""

from __future__ import annotations

import re

_SUFIJO_DE_NUBE = re.compile(r"(?:^|[:\-])cloud$", re.IGNORECASE)


def es_modelo_de_nube(modelo: str) -> bool:
    return _SUFIJO_DE_NUBE.search(modelo) is not None
