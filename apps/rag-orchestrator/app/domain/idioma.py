"""Detección de idioma por palabras funcionales (``es`` / ``en``): regla pura y determinista, sin red ni modelo.

Cuenta, en cada idioma, las palabras funcionales que no son ambiguas entre ambos; gana el idioma con más. Los
signos propios del español (``¿ ¡ ñ``) y las vocales acentuadas suman al español. Si no hay señal o hay empate, el
texto es indeterminado y decide el idioma por defecto de la configuración (``DEFAULT_QUERY_LANGUAGE``, RN-22).
"""

from __future__ import annotations

import re
from typing import Literal

Idioma = Literal["es", "en"]

_PALABRA = re.compile(r"\w+", re.UNICODE)
_SIGNOS_DEL_ESPANOL = frozenset("¿¡ñ")
_VOCALES_ACENTUADAS = frozenset("áéíóú")

# Sin palabras ambiguas entre idiomas ("a", "no", "me", "he"...): una palabra suma solo si es de un idioma.
PALABRAS_FUNCIONALES_ES = frozenset(
    "de la el los las en y que qué para con por un una es se del al como cuál cuáles sobre entre más "
    "su sus lo le les este esta estos estas desde hasta cuando donde sin son fue ser pero".split()
)
PALABRAS_FUNCIONALES_EN = frozenset(
    "the of and to in is for with on by an that this are was were be from as at or during because which "
    "what how their its it not than into after before between".split()
)


def detectar_idioma(texto: str, idioma_por_defecto: Idioma) -> Idioma:
    minusculas = texto.lower()
    palabras = _PALABRA.findall(minusculas)
    puntos_es = sum(p in PALABRAS_FUNCIONALES_ES for p in palabras) + sum(
        c in _SIGNOS_DEL_ESPANOL or c in _VOCALES_ACENTUADAS for c in minusculas
    )
    puntos_en = sum(p in PALABRAS_FUNCIONALES_EN for p in palabras)
    if puntos_es == puntos_en:
        return idioma_por_defecto
    return "es" if puntos_es > puntos_en else "en"
