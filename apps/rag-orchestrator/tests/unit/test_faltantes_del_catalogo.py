"""Regla pura de US-116 / L1D-113 (RN-11): un faltante solo puede ser una clave del catálogo; se informan posiciones."""

import pytest

from app.domain.faltantes import claves_de_faltantes_invalidas

CONOCIDAS = frozenset({"ki67", "estado_menopausico"})


def test_devuelve_vacio_cuando_no_hay_faltantes() -> None:
    assert claves_de_faltantes_invalidas([], CONOCIDAS) == ()


def test_devuelve_vacio_cuando_todas_son_claves_del_catalogo() -> None:
    assert claves_de_faltantes_invalidas(["ki67", "estado_menopausico"], CONOCIDAS) == ()


def test_devuelve_la_posicion_cuando_la_clave_no_es_del_catalogo() -> None:
    assert claves_de_faltantes_invalidas(["ki67", "psa_serie"], CONOCIDAS) == (1,)


def test_devuelve_todas_las_posiciones_invalidas_en_orden() -> None:
    assert claves_de_faltantes_invalidas(["x", "ki67", "y"], CONOCIDAS) == (0, 2)


@pytest.mark.parametrize("texto", ["Ki67", "ki 67", "ki67 ", "estado menopáusico", ""])
def test_rechaza_el_texto_que_no_cumple_la_forma_de_clave_sin_normalizarlo(texto: str) -> None:
    # Aunque el catálogo tuviera una clave igual tras normalizar: texto libre no es clave.
    conocidas = CONOCIDAS | {texto, texto.strip().lower()}

    assert claves_de_faltantes_invalidas([texto], conocidas) == (0,)


def test_acepta_la_clave_del_catalogo_repetida_porque_la_pertenencia_es_lo_que_se_valida() -> None:
    assert claves_de_faltantes_invalidas(["ki67", "ki67"], CONOCIDAS) == ()
