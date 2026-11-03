"""Datos críticos faltantes (US-116 / L1D-113, RN-11): reglas puras, sin I/O."""

import re
from collections.abc import Collection, Sequence

_FORMA_DE_CLAVE = re.compile(r"[a-z0-9_]+")


def claves_de_faltantes_invalidas(
    claves: Sequence[str], conocidas: Collection[str]
) -> tuple[int, ...]:
    """Posiciones de los elementos que no son una clave del catálogo del tipo de cáncer del caso.

    Es clave solo lo que cumple ``^[a-z0-9_]+$`` y pertenece a ``conocidas``: nada se normaliza (texto libre no es clave).
    Devuelve posiciones, nunca valores: el rechazo no debe poder repetir lo recibido (RN-10, RN-11)."""
    return tuple(
        posicion
        for posicion, clave in enumerate(claves)
        if not _FORMA_DE_CLAVE.fullmatch(clave) or clave not in conocidas
    )
