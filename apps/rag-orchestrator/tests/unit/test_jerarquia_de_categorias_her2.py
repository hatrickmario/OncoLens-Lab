"""C-2 de L1D-126 (S7.7): el código del paciente más sus ascendientes declarados en el catálogo (``rule.subsetOf``).

HER2 1+ es «bajo» y, por la jerarquía del catálogo, también «negativo»; HER2 0 solo es «negativo»; el 2+ sin ISH no está en
ninguna categoría y queda desconocido, nunca negativo. Los criterios se leen de la fixture ``test-apl-1.3.0``: la jerarquía
es un dato del catálogo, no un literal del dominio (RN-22, RN-27)."""

import dataclasses
from types import MappingProxyType

import pytest

from app.domain.aplicabilidad_tipos import ProyeccionDeEstado, ValorDelEstudio, ValorDePoblacion
from app.domain.applicability_rules import estado_de_poblacion, evaluar_criterio
from app.domain.clasificacion_de_poblacion import codigos_del_paciente
from app.domain.criterios_aplicabilidad import CriterioDeAplicabilidad
from app.infrastructure.catalogo_clinico.aplicabilidad import cargar_criterios_de_aplicabilidad
from tests.support.catalogo_aplicabilidad import APL_1_3_0

HER2: CriterioDeAplicabilidad = next(
    c
    for c in cargar_criterios_de_aplicabilidad(APL_1_3_0, ("mama",)).criterios("mama")
    if c.clave == "estado_her2"
)
IHQ_0, IHQ_1, IHQ_2, IHQ_3 = "0 (IHQ)", "1+ (IHQ)", "2+ (IHQ)", "3+ (IHQ)"
FUENTE_NEGATIVA = "HER2-negative (IHC 2+, ISH not amplified)"
FUENTE_BAJA = "HER2-low"


def _elegible(valor: str, chunk: str = "ch-1") -> ValorDePoblacion:
    return ValorDePoblacion(valor, "elegibilidad", chunk)  # type: ignore[arg-type]


@pytest.mark.ac("US-121", 5)
@pytest.mark.parametrize("fuente", [FUENTE_NEGATIVA, FUENTE_BAJA], ids=["negativa", "baja"])
def test_coincide_con_fuentes_de_her2_negativo_y_de_her2_bajo_cuando_la_paciente_tiene_ihq_1_mas(
    fuente: str,
) -> None:
    proyeccion = estado_de_poblacion([_elegible(fuente)], IHQ_1, HER2)

    assert proyeccion == ProyeccionDeEstado("coincide")


@pytest.mark.ac("US-121", 5)
def test_no_coincide_con_una_fuente_restringida_a_her2_bajo_cuando_la_paciente_tiene_ihq_0() -> (
    None
):
    proyeccion = estado_de_poblacion([_elegible(f"only {FUENTE_BAJA}")], IHQ_0, HER2)

    assert proyeccion == ProyeccionDeEstado("no_coincide")


@pytest.mark.ac("US-121", 5)
@pytest.mark.parametrize("fuente", [FUENTE_NEGATIVA, FUENTE_BAJA], ids=["negativa", "baja"])
def test_queda_desconocido_y_no_negativo_cuando_el_ihq_es_2_mas_sin_ish(fuente: str) -> None:
    proyeccion = estado_de_poblacion([_elegible(fuente)], IHQ_2, HER2)

    assert proyeccion == ProyeccionDeEstado(
        "desconocido", causa="sin_regla_de_comparacion", motivo_interno="valor_fuera_de_tabla"
    )


def test_no_coincide_con_una_fuente_de_her2_positivo_cuando_la_paciente_tiene_ihq_1_mas_y_la_fuente_es_restrictiva() -> (
    None
):
    proyeccion = estado_de_poblacion([_elegible("only HER2-positive (IHC 3+)")], IHQ_1, HER2)

    assert proyeccion == ProyeccionDeEstado("no_coincide")


@pytest.mark.parametrize(
    ("valor", "esperado"),
    [
        (IHQ_1, {"bajo", "negativo"}),
        (IHQ_0, {"negativo"}),
        (IHQ_3, {"positivo"}),
        (IHQ_2, set()),
        ("sin dato legible", set()),
    ],
    ids=[
        "ihq_1_es_bajo_y_negativo",
        "ihq_0_solo_negativo",
        "ihq_3_positivo",
        "ihq_2_sin_ish",
        "ilegible",
    ],
)
def test_devuelve_el_codigo_propio_y_sus_ascendientes_cuando_se_lee_el_valor_del_paciente(
    valor: str, esperado: set[str]
) -> None:
    assert codigos_del_paciente(valor, HER2) == frozenset(esperado)


def _con_jerarquia(jerarquia: dict[str, str]) -> CriterioDeAplicabilidad:
    regla = dataclasses.replace(
        HER2.regla,
        equivalencias=MappingProxyType({"a": ("x",), "b": ("y",), "c": ("z",)}),
        jerarquia=MappingProxyType(jerarquia),
    )
    return dataclasses.replace(HER2, regla=regla)


def test_devuelve_toda_la_cadena_de_ascendientes_cuando_la_jerarquia_tiene_dos_niveles() -> None:
    criterio = _con_jerarquia({"a": "b", "b": "c"})

    assert codigos_del_paciente("x", criterio) == frozenset({"a", "b", "c"})


def test_termina_y_devuelve_los_codigos_del_ciclo_cuando_la_jerarquia_se_cierra_sobre_si_misma() -> (
    None
):
    criterio = _con_jerarquia({"a": "b", "b": "a"})

    assert codigos_del_paciente("x", criterio) == frozenset({"a", "b"})


def test_devuelve_solo_el_codigo_propio_cuando_el_criterio_no_declara_jerarquia() -> None:
    criterio = _con_jerarquia({})

    assert codigos_del_paciente("y", criterio) == frozenset({"b"})


def test_coincide_con_el_valor_unico_negativo_de_la_forma_antigua_cuando_la_paciente_tiene_ihq_1_mas() -> (
    None
):
    evaluado = evaluar_criterio(HER2, IHQ_1, ValorDelEstudio("negativo", solo_subgrupo=False))

    assert evaluado.estado == "coincide"
