"""Datos críticos faltantes (US-116 / L1D-113, RN-11): reglas puras, sin I/O."""

import re
from collections.abc import Collection, Sequence

PATRON_DE_CLAVE = r"^[a-z0-9_]+$"
"""La forma de una clave del catálogo de datos críticos (la de ``comun.schema.json``): un solo sitio para toda la app."""
_FORMA_DE_CLAVE = re.compile(PATRON_DE_CLAVE)


def tiene_forma_de_clave(valor: str) -> bool:
    """``True`` si ``valor`` es exactamente una clave posible del catálogo (no mira si el catálogo la contiene)."""
    return _FORMA_DE_CLAVE.fullmatch(valor) is not None


def claves_de_faltantes_invalidas(
    claves: Sequence[str], conocidas: Collection[str]
) -> tuple[int, ...]:
    """Posiciones de los elementos que no son una clave del catálogo del tipo de cáncer del caso.

    Es clave solo lo que cumple ``^[a-z0-9_]+$`` y pertenece a ``conocidas``: nada se normaliza (texto libre no es clave).
    Devuelve posiciones, nunca valores: el rechazo no debe poder repetir lo recibido (RN-10, RN-11)."""
    return tuple(
        posicion
        for posicion, clave in enumerate(claves)
        if not tiene_forma_de_clave(clave) or clave not in conocidas
    )
