"""Regla de la pregunta del oncólogo (US-250, design D1): Unicode NFC, espacios Unicode colapsados y recortados.

Gemelo de `packages/clinical-language/src/normalizar-pregunta.ts`: los dos recorren la tabla
`fixtures/normalizacion-pregunta.json`. NFC y no NFKC (NFKC cambiaría símbolos con significado clínico). La clase de
espacios es explícita (no `\\s`, no `str.strip()`) para aceptar exactamente los mismos separadores que el gemelo TS;
los puntos de código se construyen con `chr()` para que ningún editor los convierta en el carácter literal.
"""

import re
import unicodedata

_PUNTOS_SUELTOS = (0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x20, 0x85, 0xA0, 0x1680, 0x2028, 0x2029)
_PUNTOS_SUELTOS += (0x202F, 0x205F, 0x3000)
_RANGO_EN = (0x2000, 0x200A)

_CLASE_DE_ESPACIOS = (
    "".join(re.escape(chr(p)) for p in _PUNTOS_SUELTOS)
    + f"{re.escape(chr(_RANGO_EN[0]))}-{re.escape(chr(_RANGO_EN[1]))}"
)
_ESPACIOS = re.compile(f"[{_CLASE_DE_ESPACIOS}]+")
# Un único espacio en cada extremo (ya colapsado); `strip()` quitaría además U+FEFF y divergiría del gemelo TS.
_BORDES = re.compile(r"^ | $")


def normalizar_pregunta(texto: str) -> str:
    return _BORDES.sub("", _ESPACIOS.sub(" ", unicodedata.normalize("NFC", texto)))
