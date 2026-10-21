"""Captura de logs por el canal real (stdout del handler JSON) y comprobación de valores prohibidos (US-037).

Lección del S2: un espía de logs que no demuestra que falla ante un valor prohibido da una falsa seguridad. Cada
suite que lo usa incluye una sonda de mutación (`test_la_sonda_...`) que inyecta el valor y exige que se detecte.
"""

import json


def parsear_lineas_json(salida: str) -> list[dict]:
    """Cada línea no vacía de la salida debe ser JSON válido (objeto); si no, falla nombrando la línea."""
    lineas = []
    for linea in salida.splitlines():
        if not linea.strip():
            continue
        try:
            objeto = json.loads(linea)
        except json.JSONDecodeError:
            raise AssertionError(f"línea de log que no es JSON: {linea!r}") from None
        assert isinstance(objeto, dict), f"línea de log que no es un objeto: {linea!r}"
        lineas.append(objeto)
    return lineas


def exigir_sin_valores_prohibidos(salida: str, prohibidos: list[str]) -> None:
    for prohibido in prohibidos:
        assert prohibido not in salida, f"{prohibido!r} aparece en los logs"
