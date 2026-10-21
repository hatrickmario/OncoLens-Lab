"""Captura de logs por el canal real (stdout del handler JSON) y comprobación de valores prohibidos (US-037).

Lección del S2: un espía de logs que no demuestra que falla ante un valor prohibido da una falsa seguridad. Cada
suite que lo usa incluye una sonda de mutación (`test_la_sonda_...`) que inyecta el valor y exige que se detecte.
"""

import json
import re


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


# Metadato del reloj del formateador (`datetime.isoformat()` en UTC): sus dígitos y puntos pueden coincidir por azar
# con un valor prohibido (p. ej. "23:27:11.789225" contiene "1.7"). Solo se excluye el campo `time` de primer nivel
# cuando es un texto con esta forma exacta; cualquier otra cosa en `time` se busca como el resto del log.
MARCA_DE_TIEMPO = r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?\+00:00"
_MARCA_COMPLETA = re.compile(MARCA_DE_TIEMPO)
_TRAMO_DEL_RELOJ = re.compile(rf'"time"\s*:\s*"{MARCA_DE_TIEMPO}"')


class _Objeto(list):
    """Objeto JSON como lista de pares (clave, valor): conserva las claves repetidas que ``dict`` colapsaría."""


def _cargar_objeto(linea: str) -> _Objeto | None:
    """El objeto JSON de la línea, o ``None`` si es otra cosa (texto suelto, array, texto delante del JSON)."""
    try:
        cargado = json.loads(linea, object_pairs_hook=_Objeto)
    except json.JSONDecodeError:
        return None
    return cargado if isinstance(cargado, _Objeto) else None


def _hojas_de_texto(valor: object) -> list[str]:
    """Claves y valores escalares (en su forma de texto) de un valor JSON, a cualquier profundidad."""
    if isinstance(valor, _Objeto):
        return [t for k, v in valor for t in [str(k), *_hojas_de_texto(v)]]
    if isinstance(valor, list):
        return [t for v in valor for t in _hojas_de_texto(v)]
    return [str(valor)]


def _es_reloj_del_formateador(clave: str, valor: object) -> bool:
    return (
        clave == "time" and isinstance(valor, str) and _MARCA_COMPLETA.fullmatch(valor) is not None
    )


def _textos_a_buscar(linea: str) -> list[str]:
    """Todo el contenido de la línea salvo el reloj. Lo que no es un objeto JSON se busca entero (no se afloja).

    Se busca en los valores decodificados y también en la línea cruda sin el tramo del reloj: la forma original de
    números y literales (1.70, 1e5, true, null, NaN) se pierde al decodificar.
    """
    objeto = _cargar_objeto(linea)
    if objeto is None:
        return [linea]
    pares = [(k, v) for k, v in objeto if not _es_reloj_del_formateador(k, v)]
    excluidos = len(objeto) - len(pares)
    cruda = linea
    if excluidos and len(_TRAMO_DEL_RELOJ.findall(linea)) == excluidos:
        cruda = _TRAMO_DEL_RELOJ.sub("", linea)
    return [cruda, *_hojas_de_texto(_Objeto(pares))]


def exigir_sin_valores_prohibidos(salida: str, prohibidos: list[str]) -> None:
    textos = [t for linea in salida.splitlines() for t in _textos_a_buscar(linea)]
    for prohibido in prohibidos:
        assert not any(prohibido in t for t in textos), f"{prohibido!r} aparece en los logs"
