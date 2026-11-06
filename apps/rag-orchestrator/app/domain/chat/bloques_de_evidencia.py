"""Texto de los bloques del turno de evidencia (US-265, RN-23): reglas puras, sin E/S.

El encabezado «Opciones descritas en la evidencia» es lo único que el código añade al contenido ya validado del análisis;
las opciones y sus razones llegan de ``/rag/query`` con soporte NLI y sin lenguaje prescriptivo, en el orden de RN-28.
"""

from __future__ import annotations

from collections.abc import Sequence

from app.domain.chat.mensajes import ENCABEZADO_DE_OPCIONES


def texto_de_las_opciones(opciones: Sequence[tuple[str, str]]) -> str:
    """El encabezado y una línea numerada por opción (``nombre. razón``), en el orden recibido."""
    lineas = [f"{n}. {nombre}. {razon}" for n, (nombre, razon) in enumerate(opciones, start=1)]
    return "\n".join([f"{ENCABEZADO_DE_OPCIONES}:", *lineas])
