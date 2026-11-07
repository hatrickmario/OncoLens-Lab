"""Aviso de ampliación de la búsqueda (US-271, ADR-52, RN-19): lo arma el código desde los campos, sin valores."""

import pytest

from app.domain.chat.ampliacion_de_busqueda import aviso_de_busqueda_ampliada

PREFIJO = "La búsqueda se amplió con datos del caso"


@pytest.mark.parametrize(
    ("campos", "esperado"),
    [
        (("tipo", "estadio", "biomarcador_principal"), "tipo, estadio y biomarcador"),
        (("tipo", "estadio"), "tipo y estadio"),
        (("estadio", "biomarcador_principal"), "estadio y biomarcador"),
        (("tipo",), "tipo"),
    ],
)
def test_aviso_une_los_campos_usados_con_comas_y_y_cuando_son_varios(campos, esperado):
    assert aviso_de_busqueda_ampliada(PREFIJO, campos) == f"{PREFIJO}: {esperado}"
