"""Expresión de filtro de Milvus para la recuperación (RN-05, OL-02): regla pura, una sola fuente."""

from __future__ import annotations

import re

FILTRO_VIGENTE = "is_current == true"
# El tipo de cáncer viene de texto enmascarado de la petición: solo se acepta lo que no puede alterar la expresión.
_TIPO_DE_CANCER_SEGURO = re.compile(r"[a-záéíóúüñ0-9][a-záéíóúüñ0-9 _-]{0,63}")


def expresion_filtro_vigente(cancer_type: str | None = None) -> str:
    """Siempre ``is_current == true`` (RN-05); con ``cancer_type``, además la restricción de ``cancer_type_tags``.

    ``cancer_type_tags`` es una lista separada por comas (data-model §4.7), de ahí ``like``. Lanza ``ValueError`` si el
    tipo está vacío o trae caracteres que podrían alterar la expresión.
    """
    if cancer_type is None:
        return FILTRO_VIGENTE
    tipo = cancer_type.strip().lower()
    if _TIPO_DE_CANCER_SEGURO.fullmatch(tipo) is None:
        raise ValueError("el tipo de cáncer no es utilizable en el filtro de recuperación")
    return f'{FILTRO_VIGENTE} and cancer_type_tags like "%{tipo}%"'
