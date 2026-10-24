"""Regla pura del vector sparse de BGE-M3 (US-117a D3)."""

from __future__ import annotations

from app.domain.pesos_sparse import agrupar_pesos_por_token


def test_ignora_los_tokens_especiales_del_inicio_y_del_final() -> None:
    assert agrupar_pesos_por_token([0, 7, 9, 2], [0.9, 0.5, 0.25, 0.8]) == {7: 0.5, 9: 0.25}


def test_conserva_el_maximo_cuando_un_token_se_repite() -> None:
    assert agrupar_pesos_por_token([0, 7, 7, 2], [0.0, 0.2, 0.6, 0.0]) == {7: 0.6}


def test_descarta_los_pesos_no_positivos() -> None:
    assert agrupar_pesos_por_token([0, 7, 9, 2], [0.0, 0.0, 0.3, 0.0]) == {9: 0.3}


def test_devuelve_un_mapa_vacio_cuando_ningun_token_tiene_peso() -> None:
    assert agrupar_pesos_por_token([0, 7, 2], [0.0, 0.0, 0.0]) == {}
    assert agrupar_pesos_por_token([], []) == {}
