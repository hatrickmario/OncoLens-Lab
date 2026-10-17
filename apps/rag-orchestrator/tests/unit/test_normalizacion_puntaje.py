"""``normalizar_a_unidad``: regla pura de dominio (RN-03), sin adapters ni mocks."""

from __future__ import annotations

import pytest
from app.domain.normalizacion_puntaje import normalizar_a_unidad


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
