"""Lector doble de `population_criteria` (US-241, ADR-47, design D4–D6): reglas puras, sin adapters."""

import pytest

from app.domain.aplicabilidad_tipos import (
    CriterioDePoblacion,
    FormaInvalida,
    ValorDePoblacion,
)
from app.domain.poblacion_del_estudio import leer_criterio_guardado, poblacion_desde_lo_guardado
from tests.support.poblacion_lista import MARCA_PENDIENTE, valor_nuevo

MAX = 3


def _elegibilidad(valor: str, chunk_id: str | None) -> ValorDePoblacion:
    return ValorDePoblacion(valor, "elegibilidad", chunk_id)


# --- forma antigua ---------------------------------------------------------------------------------------------------


def test_cadena_con_texto_es_un_valor_de_elegibilidad_sin_fragmento():
    assert leer_criterio_guardado("I–III", MAX) == CriterioDePoblacion(
        (_elegibilidad("I–III", None),)
    )


@pytest.mark.parametrize("vacio", ["", "no_disponible"])
def test_cadena_vacia_o_no_disponible_es_un_criterio_sin_valores(vacio: str):
    assert leer_criterio_guardado(vacio, MAX) == CriterioDePoblacion()


def test_objeto_valor_alcance_conserva_el_subgrupo():
    leido = leer_criterio_guardado({"valor": "0-1", "alcance": "subgrupo"}, MAX)

    assert leido.valores == (ValorDePoblacion("0-1", "subgrupo", None),)


def test_objeto_valor_con_otro_alcance_es_de_elegibilidad():
    assert leer_criterio_guardado({"valor": "0-1", "alcance": "otro"}, MAX).valores == (
        _elegibilidad("0-1", None),
    )


@pytest.mark.parametrize("ajeno", [None, 3, {"valor": 3}, {"otra": "cosa"}])
def test_una_forma_antigua_no_reconocida_es_un_criterio_sin_valores_y_sin_invalidez(ajeno: object):
    assert leer_criterio_guardado(ajeno, MAX) == CriterioDePoblacion()


def test_biomarcadores_anidados_se_leen_con_clave_de_subclave():
    poblacion = poblacion_desde_lo_guardado(
        "fuente_estructurada", {"biomarcadores": {"her2": "positivo"}, "ecog": "0-1"}, MAX
    )

    assert set(poblacion.criterios) == {"biomarcadores.her2", "ecog"}
    assert poblacion.criterios["biomarcadores.her2"].valores == (_elegibilidad("positivo", None),)


def test_un_objeto_de_biomarcadores_vacio_no_aporta_criterios():
    poblacion = poblacion_desde_lo_guardado("fuente_estructurada", {"biomarcadores": {}}, MAX)

    assert dict(poblacion.criterios) == {}


# --- forma nueva -----------------------------------------------------------------------------------------------------


def test_lista_nueva_conserva_valor_fragmento_y_alcance_en_orden():
    guardado = [
        valor_nuevo("premenopausal women", "ch-b1-1"),
        valor_nuevo("TNBC", "ch-b1-2", "subgrupo"),
    ]

    leido = leer_criterio_guardado(guardado, MAX)

    assert leido.valores == (
        _elegibilidad("premenopausal women", "ch-b1-1"),
        ValorDePoblacion("TNBC", "subgrupo", "ch-b1-2"),
    )
    assert leido.invalidez is None and not leido.pendiente


def test_objeto_con_values_sin_estado_se_lee_como_lista():
    leido = leer_criterio_guardado({"values": [valor_nuevo("positivo", "ch-1")]}, MAX)

    assert leido.valores == (_elegibilidad("positivo", "ch-1"),)


def test_lista_vacia_es_un_criterio_sin_valores_y_valido():
    assert leer_criterio_guardado([], MAX) == CriterioDePoblacion()


def test_la_marca_pendiente_es_un_criterio_pendiente_sin_valores_y_sin_invalidez():
    assert leer_criterio_guardado(MARCA_PENDIENTE, MAX) == CriterioDePoblacion(pendiente=True)


@pytest.mark.parametrize(
    "marca",
    [
        {"status": "pendiente", "values": [valor_nuevo("x", "ch-1")]},
        {"status": "otro", "values": []},
        {"values": "texto"},
    ],
)
def test_una_marca_con_estado_o_valores_incoherentes_es_invalida(marca: dict):
    leido = leer_criterio_guardado(marca, MAX)

    assert leido.invalidez == FormaInvalida("valor_invalido", None)
    assert leido.valores == () and not leido.pendiente


def test_mas_valores_que_el_tope_de_un_mismo_fragmento_es_invalido_con_su_chunk():
    guardado = [valor_nuevo(f"v{n}", "ch-1") for n in range(MAX + 1)]

    leido = leer_criterio_guardado(guardado, MAX)

    assert leido == CriterioDePoblacion(invalidez=FormaInvalida("demasiados_valores", "ch-1"))


def test_el_tope_es_por_fragmento_y_no_del_criterio():
    guardado = [valor_nuevo(f"a{n}", "ch-1") for n in range(MAX)] + [
        valor_nuevo(f"b{n}", "ch-2") for n in range(MAX)
    ]

    leido = leer_criterio_guardado(guardado, MAX)

    assert len(leido.valores) == 2 * MAX and leido.invalidez is None


def test_el_tope_sale_del_parametro_y_no_de_un_literal():
    guardado = [valor_nuevo("a", "ch-1"), valor_nuevo("b", "ch-1")]

    assert leer_criterio_guardado(guardado, 1).invalidez == FormaInvalida(
        "demasiados_valores", "ch-1"
    )
    assert leer_criterio_guardado(guardado, 2).invalidez is None


def test_un_alcance_fuera_del_enum_es_invalido_con_su_chunk():
    leido = leer_criterio_guardado([valor_nuevo("x", "ch-1", "global")], MAX)

    assert leido == CriterioDePoblacion(invalidez=FormaInvalida("alcance_fuera_de_enum", "ch-1"))


@pytest.mark.parametrize(
    "elemento",
    [
        "texto suelto",
        {"value": "", "chunkId": "ch-1", "scope": "elegibilidad"},
        {"value": 3, "chunkId": "ch-1", "scope": "elegibilidad"},
        {"value": "x", "chunkId": "", "scope": "elegibilidad"},
        {"value": "x", "scope": "elegibilidad"},
    ],
)
def test_un_elemento_sin_valor_texto_o_sin_fragmento_es_invalido(elemento: object):
    leido = leer_criterio_guardado([elemento], MAX)

    assert leido.invalidez is not None and leido.invalidez.motivo == "valor_invalido"
    assert leido.valores == ()


def test_la_invalidez_nunca_lleva_el_valor():
    leido = leer_criterio_guardado([valor_nuevo("SENTINELA-VALOR", "ch-1", "global")], MAX)

    assert "SENTINELA" not in repr(leido)


def test_un_criterio_invalido_no_contagia_a_los_demas_de_la_fila():
    poblacion = poblacion_desde_lo_guardado(
        "extraido_verificado",
        {
            "ecog": [valor_nuevo("x", "ch-1", "global")],
            "estadio": [valor_nuevo("I", "ch-1")],
            "linea": MARCA_PENDIENTE,
        },
        MAX,
    )

    assert poblacion.criterios["ecog"].invalidez is not None
    assert poblacion.criterios["estadio"].valores == (_elegibilidad("I", "ch-1"),)
    assert poblacion.criterios["linea"].pendiente
