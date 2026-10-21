"""Artefactos de generación en el texto del LLM (ARR-08): reglas puras, sin E/S.

El decodificador restringido por esquema a veces emite un token ajeno (un ideograma dentro de «B-31», «7erm» por «a los»);
el NLI lo da por implicado porque el resto de la frase coincide con la fuente. Se detecta de forma determinista y el párrafo
afectado se omite: el detalle es opcional.
"""

from __future__ import annotations

import re
import unicodedata

CARACTER_DE_REEMPLAZO = "�"
# Una palabra que empieza con dígitos y sigue con 3 o más letras minúsculas sin separador («7erm»): ni unidad ni sigla.
PALABRA_ROTA = re.compile(r"(?<![\w-])\d+[a-záéíóúüñ]{3,}(?![\w-])")
ESCRITURAS_ADMITIDAS = ("LATIN", "GREEK", "MICRO SIGN", "FEMININE ORDINAL", "MASCULINE ORDINAL")


def tiene_artefactos(texto: str) -> bool:
    """``True`` si el texto trae el carácter de reemplazo, letras de otra escritura (CJK, cirílico…) o una palabra rota.

    Se admiten el griego y los signos µ, ª y º porque la literatura clínica los usa (α-bloqueadores, µg, 1.ª línea); todo lo demás que no sea latino es ajeno.
    """
    if CARACTER_DE_REEMPLAZO in texto or PALABRA_ROTA.search(texto):
        return True
    return any(
        unicodedata.category(c).startswith("L")
        and not unicodedata.name(c, "").startswith(ESCRITURAS_ADMITIDAS)
        for c in texto
    )
