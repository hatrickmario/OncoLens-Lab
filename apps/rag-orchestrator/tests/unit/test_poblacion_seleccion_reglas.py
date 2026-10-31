"""Deduplicación y tope por fragmento y criterio (US-242, ADR-47, D4). Reglas puras, sin adapters."""

from __future__ import annotations

from app.domain.corpus_metadata.poblacion_abanico import ValorPropuesto
from app.domain.corpus_metadata.poblacion_seleccion import (
    aplicar_tope,
    clave_de_comparacion,
    deduplicar,
)


def _v(valor: str, chunk: str = "c1", alcance: str = "elegibilidad") -> ValorPropuesto:
    return ValorPropuesto(valor, chunk, alcance)  # type: ignore[arg-type]


def test_deduplicar_deja_un_valor_cuando_solo_cambia_la_capitalizacion_y_conserva_el_primero() -> (
    None
):
    primero, segundo = _v("postmenopausal women", "c1"), _v("Postmenopausal women", "c3")

    assert deduplicar([primero, segundo], {}) == (primero,)


def test_deduplicar_prefiere_el_de_mayor_alcance_aunque_llegue_despues() -> None:
    mencion, elegibilidad = _v("HER2-positive", "c3", "mencion"), _v("her2 positive", "c1")

    assert deduplicar([mencion, elegibilidad], {}) == (elegibilidad,)


def test_deduplicar_une_los_sinonimos_del_catalogo_en_un_termino_canonico() -> None:
    sinonimos = {
        "post menopausal": "postmenopausal women",
        "postmenopausal women": "postmenopausal women",
    }
    valores = [_v("Post-menopausal"), _v("postmenopausal women", "c2")]

    assert deduplicar(valores, sinonimos) == (valores[0],)
    assert clave_de_comparacion("Post-menopausal", sinonimos) == "postmenopausal women"


def test_deduplicar_conserva_los_valores_distintos_en_su_orden() -> None:
    valores = [_v("b"), _v("a"), _v("b", "c2")]

    assert deduplicar(valores, {}) == (valores[0], valores[1])


def test_aplicar_tope_ordena_por_alcance_y_luego_por_la_salida_dentro_de_un_fragmento() -> None:
    valores = [
        _v("mencion 1", alcance="mencion"),
        _v("subgrupo 1", alcance="subgrupo"),
        _v("elegibilidad 1"),
        _v("mencion 2", alcance="mencion"),
        _v("elegibilidad 2"),
    ]

    resultado = aplicar_tope(valores, 3)

    assert [v.valor for v in resultado.conservados] == [
        "elegibilidad 1",
        "elegibilidad 2",
        "subgrupo 1",
    ]
    assert resultado.fuera_del_tope == 2


def test_aplicar_tope_cuenta_cada_fragmento_por_separado() -> None:
    valores = [_v(f"v{i}", "c1") for i in range(3)] + [_v(f"w{i}", "c2") for i in range(3)]

    resultado = aplicar_tope(valores, 3)

    assert len(resultado.conservados) == 6
    assert resultado.fuera_del_tope == 0


def test_aplicar_tope_lee_el_maximo_del_argumento_y_no_de_un_literal() -> None:
    valores = [_v(f"v{i}") for i in range(5)]

    assert len(aplicar_tope(valores, 2).conservados) == 2
    assert len(aplicar_tope(valores, 5).conservados) == 5
    assert aplicar_tope(valores, 1).fuera_del_tope == 4


def test_aplicar_tope_sin_valores_no_cuenta_nada() -> None:
    resultado = aplicar_tope([], 3)

    assert (resultado.conservados, resultado.fuera_del_tope) == ((), 0)
