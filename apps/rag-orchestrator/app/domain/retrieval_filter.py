"""Expresión de filtro de Milvus para la recuperación (RN-05, OL-02): regla pura, una sola fuente.

Conoce la sintaxis de expresiones de Milvus a propósito (decisión D2 del change): la regla "solo vigentes y de la
etiqueta completa" es del dominio y debe probarse sin Milvus; el repositorio solo la envía.
"""

from __future__ import annotations

import re

FILTRO_VIGENTE = "is_current == true"
_PREFIJO_CON_RESTRICCION = f"{FILTRO_VIGENTE} and ("
# El tipo es el código del catálogo versionado (RN-27): la normalización (tildes, mayúsculas, sinónimos) es de
# Backend 1 (ADR-33). Aquí solo se acepta lo que no puede alterar la expresión.
_CODIGO_DE_CATALOGO = re.compile(r"[a-z][a-z0-9_]*")


LONGITUD_MAXIMA_DE_CODIGO = 64


def escapar_patron_like(texto: str) -> str:
    raise NotImplementedError("no implementado")


def expresion_solo_vigente() -> str:
    """``is_current == true`` (RN-05): la recuperación nunca devuelve el histórico del corpus."""
    return FILTRO_VIGENTE


def expresion_vigente_del_tipo(cancer_type: str) -> str:
    """Vigente y con la etiqueta COMPLETA ``cancer_type`` dentro de ``cancer_type_tags`` (lista separada por comas).

    Compara la etiqueta entera (sola, primera, última o intermedia), así ``mama`` no casa con ``mama_masculina`` ni
    ``ta`` con ``prostata``. Lanza ``ValueError`` si ``cancer_type`` no es un código de catálogo.
    """
    tipo = _exigir_codigo_de_catalogo(cancer_type)
    etiqueta = (
        f'cancer_type_tags == "{tipo}" or cancer_type_tags like "{tipo},%"'
        f' or cancer_type_tags like "%,{tipo}" or cancer_type_tags like "%,{tipo},%"'
    )
    return f"{_PREFIJO_CON_RESTRICCION}{etiqueta})"


def exigir_filtro_vigente(filtro: str) -> str:
    """Devuelve ``filtro`` si ``is_current == true`` es una condición obligatoria; si no, ``ValueError`` (RN-05).

    Acepta solo la expresión vigente o ``is_current == true and (<resto>)`` con el resto entero entre paréntesis:
    ``... or ...`` o ``... and (a) or (b)`` dejarían pasar chunks no vigentes.
    """
    if filtro == FILTRO_VIGENTE:
        return filtro
    abre = len(_PREFIJO_CON_RESTRICCION) - 1
    if filtro.startswith(_PREFIJO_CON_RESTRICCION) and _el_parentesis_cierra_al_final(filtro, abre):
        return filtro
    raise ValueError("el filtro de búsqueda debe exigir is_current == true (RN-05)")


def coincide_etiqueta(cancer_type_tags: str, cancer_type: str) -> bool:
    """La misma regla que ``expresion_vigente_del_tipo`` aplicada en memoria: etiqueta completa en la lista."""
    return _exigir_codigo_de_catalogo(cancer_type) in cancer_type_tags.split(",")


def _exigir_codigo_de_catalogo(cancer_type: str) -> str:
    if _CODIGO_DE_CATALOGO.fullmatch(cancer_type) is None:
        raise ValueError("el tipo de cáncer no es un código de catálogo utilizable en el filtro")
    return cancer_type


def _el_parentesis_cierra_al_final(expresion: str, posicion_de_apertura: int) -> bool:
    """``True`` si el paréntesis de ``posicion_de_apertura`` se cierra exactamente en el último carácter."""
    profundidad = 0
    entre_comillas = False
    for posicion in range(posicion_de_apertura, len(expresion)):
        caracter = expresion[posicion]
        if caracter == '"':
            entre_comillas = not entre_comillas
        elif not entre_comillas and caracter == "(":
            profundidad += 1
        elif not entre_comillas and caracter == ")":
            profundidad -= 1
            if profundidad == 0:
                return posicion == len(expresion) - 1
    return False
