"""Chequeo numérico de una interpretación del chat (US-261, ADR-34, RN-01): segunda barrera, pura y sin LLM ni NLI.

Una afirmación ``interpretacion`` se omite si escribe una cifra, una unidad o un «N días antes/después» que no están en la
descripción determinista de los hechos que cita (``describir_hecho``): el NLI puede dejar pasar una paráfrasis con un número
cambiado, esta regla no. Corre ANTES del NLI, así lo inventado ni siquiera lo consulta.

Qué compara:

- Cada cifra «libre» de la afirmación (no pegada a letras ni a ``_``: ``HER2``, ``TNM_8``, ``T2cN0M0`` no son cifras) debe
  estar en la descripción. Si va seguida de una unidad de la lista cerrada (``UNIDADES``), el par (valor, unidad) debe estar
  en la descripción; sin unidad, basta que el valor aparezca en ella (también como parte de ``HER2`` o ``TNM_8``).
- Cada «N días antes» / «N días después» de la afirmación debe estar igual en la descripción: no se invierte el sentido.
- La coma decimal vale como el punto (``0,5`` = ``0.5``), los ceros a la derecha no cuentan (``4,20`` = ``4.2``) y el signo
  se ignora.

Límite: una cifra inventada que coincide con otra cifra de la descripción (sin unidad) no se detecta; el NLI sigue siendo
la barrera semántica.
"""

from __future__ import annotations

import re
import unicodedata
from decimal import Decimal

UNIDADES = (
    "mmol/l",
    "pg/ml",
    "ng/ml",
    "mg/dl",
    "mg/m2",
    "mg/kg",
    "g/dl",
    "u/ml",
    "ui/l",
    "u/l",
    "mm3",
    "semanas",
    "semana",
    "ciclos",
    "ciclo",
    "meses",
    "mes",
    "anos",
    "ano",
    "dias",
    "dia",
    "kg",
    "mg",
    "ug",
    "µg",
    "ml",
    "cm",
    "mm",
    "gy",
)
"""Lista cerrada de unidades (sin tildes y en minúsculas) más ``%``; una unidad fuera de ella no se compara."""
_EQUIVALENTE = {
    "dias": "dia",
    "semanas": "semana",
    "meses": "mes",
    "anos": "ano",
    "ciclos": "ciclo",
}
_NUMERO = r"\d+(?:[.,]\d+)?"
_UNIDAD = r"%|(?:" + "|".join(UNIDADES) + r")(?![\w/])"
_CIFRA_LIBRE = re.compile(rf"(?<![\w])(?P<valor>{_NUMERO})(?:\s*(?P<unidad>{_UNIDAD}))?")
_CUALQUIER_CIFRA = re.compile(_NUMERO)
_DIAS_Y_SENTIDO = re.compile(r"(?<![\w])(\d+)\s*dias?\s+(antes|despues)\b")


def cifras_sostenidas_por_la_descripcion(afirmacion: str, descripcion: str) -> bool:
    """``True`` si toda cifra, unidad y sentido temporal de la afirmación está en la descripción de sus hechos."""
    escrita = _normalizado(afirmacion)
    fuente = _normalizado(descripcion)
    cifras_de_la_fuente = {_valor(c) for c in _CUALQUIER_CIFRA.findall(fuente)}
    pares_de_la_fuente = set(_cifras_libres(fuente))
    for valor, unidad in _cifras_libres(escrita):
        if unidad is None:
            if valor not in cifras_de_la_fuente:
                return False
        elif (valor, unidad) not in pares_de_la_fuente:
            return False
    return _sentidos(escrita) <= _sentidos(fuente)


def _cifras_libres(texto: str) -> list[tuple[str, str | None]]:
    """(valor, unidad o ``None``) de cada cifra no pegada a letras ni a ``_``, con el valor normalizado."""
    cifras: list[tuple[str, str | None]] = []
    for coincidencia in _CIFRA_LIBRE.finditer(texto):
        valor = _valor(coincidencia["valor"])
        unidad = coincidencia["unidad"]
        cifras.append((valor, None if unidad is None else _EQUIVALENTE.get(unidad, unidad)))
    return cifras


def _sentidos(texto: str) -> set[tuple[str, str]]:
    return {(_valor(dias), sentido) for dias, sentido in _DIAS_Y_SENTIDO.findall(texto)}


def _valor(cifra: str) -> str:
    """El valor canónico: coma decimal como punto y sin ceros a la derecha (``0,50`` → ``0.5``)."""
    return format(Decimal(cifra.replace(",", ".")).normalize(), "f")


def _normalizado(texto: str) -> str:
    sin_tildes = unicodedata.normalize("NFD", texto.casefold())
    return "".join(c for c in sin_tildes if not unicodedata.combining(c))
