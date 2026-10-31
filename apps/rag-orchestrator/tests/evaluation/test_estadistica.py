"""Módulo estadístico único de la suite `evaluate` (D4-09): fija las dos definiciones de percentil y la mediana."""

from __future__ import annotations

import pytest

from app.evaluation import cronometro, medicion_modelos
from app.evaluation.estadistica import mediana, percentil_interpolado, percentil_rango_mas_cercano

MUESTRA = [10.0, 20.0, 30.0, 40.0]


def test_la_mediana_promedia_los_dos_centrales_en_una_muestra_par() -> None:
    assert mediana(MUESTRA) == 25.0
    assert mediana(x for x in (3.0, 1.0, 2.0)) == 2.0


def test_el_rango_mas_cercano_devuelve_un_elemento_de_la_muestra() -> None:
    assert percentil_rango_mas_cercano(MUESTRA, 0.95) == 40.0
    assert percentil_rango_mas_cercano(MUESTRA, 0.50) == 20.0


def test_el_rango_mas_cercano_devuelve_none_y_no_cero_con_la_muestra_vacia() -> None:
    assert percentil_rango_mas_cercano([], 0.95) is None


def test_el_percentil_interpolado_difiere_del_de_rango_mas_cercano_en_la_misma_muestra() -> None:
    assert percentil_interpolado(MUESTRA, 95) == pytest.approx(38.5)


def test_el_percentil_interpolado_rechaza_la_muestra_vacia() -> None:
    with pytest.raises(ValueError):
        percentil_interpolado([], 95)


def test_las_funciones_historicas_delegan_en_el_modulo_unico() -> None:
    assert cronometro.percentil(MUESTRA, 0.95) == percentil_rango_mas_cercano(MUESTRA, 0.95)
    assert medicion_modelos.percentil_95_interpolado(MUESTRA) == percentil_interpolado(MUESTRA, 95)
    assert medicion_modelos.mediana_estadistica(MUESTRA) == mediana(MUESTRA)
