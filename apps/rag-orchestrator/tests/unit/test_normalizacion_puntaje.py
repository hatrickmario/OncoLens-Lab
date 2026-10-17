"""``normalizar_a_unidad``: regla pura de dominio (RN-03), sin adapters ni mocks."""

from __future__ import annotations

import pytest
from app.domain.normalizacion_puntaje import normalizar_a_unidad, validar_puntaje_normalizado


def test_normalizar_a_unidad_devuelve_un_medio_para_el_puntaje_cero() -> None:
    assert normalizar_a_unidad([0.0]) == [0.5]


def test_normalizar_a_unidad_conserva_el_orden_y_queda_en_el_intervalo_abierto_0_1() -> None:
    normalizados = normalizar_a_unidad([-8.0, -1.0, 0.0, 2.0, 8.0])

    assert normalizados == sorted(normalizados) and all(0.0 < n < 1.0 for n in normalizados)


def test_normalizar_a_unidad_es_simetrica_respecto_de_cero() -> None:
    mas, menos = normalizar_a_unidad([3.0, -3.0])

    assert mas + menos == pytest.approx(1.0)


def test_normalizar_a_unidad_de_una_lista_vacia_es_una_lista_vacia() -> None:
    assert normalizar_a_unidad([]) == []


@pytest.mark.parametrize("puntaje", [0.0, 0.42, 1.0, 0, 1])
def test_validar_puntaje_normalizado_devuelve_el_mismo_valor_cuando_esta_en_el_intervalo_unitario(
    puntaje,
) -> None:
    assert validar_puntaje_normalizado(puntaje) == puntaje


@pytest.mark.parametrize("puntaje", [-0.01, 1.01, float("nan"), float("inf"), float("-inf")])
def test_validar_puntaje_normalizado_rechaza_el_valor_fuera_del_intervalo_unitario(puntaje) -> None:
    with pytest.raises(ValueError):
        validar_puntaje_normalizado(puntaje)


@pytest.mark.parametrize("puntaje", [None, "0.5", True, False, b"1", [0.5], object()])
def test_validar_puntaje_normalizado_rechaza_lo_que_no_es_un_numero(puntaje) -> None:
    # bool es subclase de int: True no puede colarse como 1.0.
    with pytest.raises(TypeError):
        validar_puntaje_normalizado(puntaje)
