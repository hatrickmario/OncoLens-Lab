"""Truncado y lotes por presupuesto de tokens (US-231a): reglas puras, deterministas."""

from app.infrastructure.models.lotes import (
    agrupar_por_presupuesto_de_tokens,
    truncar_conservando_el_separador_final,
)


def test_no_trunca_cuando_la_secuencia_cabe() -> None:
    assert truncar_conservando_el_separador_final([0, 5, 6, 2], 4) == [0, 5, 6, 2]


def test_trunca_conservando_el_separador_final_cuando_excede_el_maximo() -> None:
    assert truncar_conservando_el_separador_final([0, 5, 6, 7, 8, 2], 4) == [0, 5, 6, 2]


def test_agrupa_por_largo_creciente_y_respeta_el_presupuesto() -> None:
    secuencias = [[1] * 6, [1] * 2, [1] * 6, [1] * 3]

    assert agrupar_por_presupuesto_de_tokens(secuencias, 12) == [[1, 3], [0, 2]]


def test_una_secuencia_mayor_que_el_presupuesto_va_sola() -> None:
    assert agrupar_por_presupuesto_de_tokens([[1] * 10, [1] * 2], 4) == [[1], [0]]


def test_el_desempate_por_largo_conserva_el_orden_de_llegada() -> None:
    secuencias = [[1] * 3] * 5

    assert agrupar_por_presupuesto_de_tokens(secuencias, 6) == [[0, 1], [2, 3], [4]]


def test_sin_secuencias_no_hay_lotes() -> None:
    assert agrupar_por_presupuesto_de_tokens([], 100) == []
