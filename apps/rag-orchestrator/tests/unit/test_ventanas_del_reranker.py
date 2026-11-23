"""Reglas puras de las ventanas del reranker (US-278, RN-03, RN-22): cobertura del chunk y agregación por máximo."""

from __future__ import annotations

import itertools
import math

import pytest

from app.domain.ventanas_del_reranker import (
    MODO_DE_VENTANAS_INICIAL,
    RERANKER_WINDOW_OVERLAP_INICIAL,
    Ventana,
    agregar_por_maximo,
    trazar_ventanas,
)


def test_un_pasaje_que_cabe_da_una_sola_ventana_que_lo_cubre_entero() -> None:
    assert trazar_ventanas(longitud_del_pasaje=10, capacidad=10, solape=3) == (Ventana(0, 10),)
    assert trazar_ventanas(longitud_del_pasaje=4, capacidad=10, solape=3) == (Ventana(0, 4),)


def test_un_pasaje_que_supera_la_capacidad_avanza_capacidad_menos_solape_por_ventana() -> None:
    ventanas = trazar_ventanas(longitud_del_pasaje=25, capacidad=10, solape=2)

    assert ventanas == (Ventana(0, 10), Ventana(8, 18), Ventana(15, 25))


def test_la_ultima_ventana_termina_en_el_final_del_pasaje_en_vez_de_quedar_corta() -> None:
    ventanas = trazar_ventanas(longitud_del_pasaje=21, capacidad=10, solape=2)

    assert ventanas[-1] == Ventana(11, 21)
    assert all(v.fin - v.inicio == 10 for v in ventanas)


def test_sin_solape_las_ventanas_se_encadenan_sin_dejar_tokens_fuera() -> None:
    assert trazar_ventanas(20, 10, 0) == (Ventana(0, 10), Ventana(10, 20))


@pytest.mark.parametrize("longitud", range(1, 60))
@pytest.mark.parametrize("solape", [0, 1, 4, 9])
def test_las_ventanas_cubren_todos_los_tokens_sin_pasar_de_la_capacidad_ni_del_pasaje(
    longitud: int, solape: int
) -> None:
    capacidad = 10

    ventanas = trazar_ventanas(longitud, capacidad, solape)

    cubiertos = {i for v in ventanas for i in range(v.inicio, v.fin)}
    assert cubiertos == set(range(longitud))
    assert all(
        0 <= v.inicio < v.fin <= longitud and v.fin - v.inicio <= capacidad for v in ventanas
    )
    assert [v.inicio for v in ventanas] == sorted(
        {v.inicio for v in ventanas}
    )  # sin repetidas ni desordenadas


@pytest.mark.parametrize(
    ("capacidad", "solape"), [(0, 0), (-1, 0), (10, 10), (10, 11), (5, 9), (10, -1)]
)
def test_una_capacidad_que_no_deja_avanzar_la_ventana_se_rechaza(
    capacidad: int, solape: int
) -> None:
    with pytest.raises(ValueError):
        trazar_ventanas(20, capacidad, solape)


def test_un_pasaje_vacio_se_rechaza_en_vez_de_inventar_una_ventana() -> None:
    with pytest.raises(ValueError):
        trazar_ventanas(0, 10, 2)


def test_el_maximo_es_el_mayor_logit_de_las_ventanas() -> None:
    assert agregar_por_maximo([-3.0, 2.5, 0.1]) == 2.5
    assert agregar_por_maximo([1.25]) == 1.25


def test_el_maximo_no_depende_del_orden_de_las_ventanas() -> None:
    logits = [0.5, -2.0, 3.25, 3.25, 1.0]

    resultados = {agregar_por_maximo(list(p)) for p in itertools.permutations(logits)}

    assert resultados == {3.25}


def test_dos_ventanas_empatadas_dan_el_mismo_maximo_en_un_orden_y_en_el_inverso() -> None:
    assert agregar_por_maximo([1.5, 1.5]) == agregar_por_maximo([1.5, 1.5][::-1]) == 1.5


def test_una_lista_vacia_se_rechaza_en_vez_de_devolver_cero() -> None:
    with pytest.raises(ValueError):
        agregar_por_maximo([])


@pytest.mark.parametrize("valor", [math.nan, math.inf, -math.inf])
def test_un_logit_no_finito_se_rechaza_porque_el_maximo_con_nan_depende_del_orden(
    valor: float,
) -> None:
    with pytest.raises(ValueError):
        agregar_por_maximo([1.0, valor])


def test_las_constantes_iniciales_son_primera_y_64_tokens_de_solape() -> None:
    assert MODO_DE_VENTANAS_INICIAL == "primera"
    assert RERANKER_WINDOW_OVERLAP_INICIAL == 64
