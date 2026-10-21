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


# Metadato del reloj del formateador: sus dígitos y puntos pueden coincidir por azar con un valor prohibido (p. ej.
# "23:27:11.789225" contiene "1.7"). Es el único campo excluido; todo lo demás se busca.
CAMPOS_DE_METADATO_DEL_RELOJ = ("time",)


def _hojas_de_texto(valor: object) -> list[str]:
    """Claves y valores escalares (en su forma de texto) de un valor JSON, a cualquier profundidad."""
    if isinstance(valor, dict):
        return [t for k, v in valor.items() for t in [str(k), *_hojas_de_texto(v)]]
    if isinstance(valor, list):
        return [t for v in valor for t in _hojas_de_texto(v)]
    return [str(valor)]


def _textos_a_buscar(linea: str) -> list[str]:
    """El contenido de la línea sin el reloj; una línea que no es un objeto JSON se busca entera (no se afloja)."""
    try:
        objeto = json.loads(linea)
    except json.JSONDecodeError:
        return [linea]
    if not isinstance(objeto, dict):
        return [linea]
    return _hojas_de_texto(
        {k: v for k, v in objeto.items() if k not in CAMPOS_DE_METADATO_DEL_RELOJ}
    )


def exigir_sin_valores_prohibidos(salida: str, prohibidos: list[str]) -> None:
    textos = [t for linea in salida.splitlines() for t in _textos_a_buscar(linea)]
    for prohibido in prohibidos:
        assert not any(prohibido in t for t in textos), f"{prohibido!r} aparece en los logs"
