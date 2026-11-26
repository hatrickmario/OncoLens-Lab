"""C-1 de L1D-126 (S7.8): ``extension`` excluyente en próstata con la lectura declarativa de M0/M1 desde ``stage_value``.

La lectura de M0/M1 es un dato del criterio (``rule.equivalenceMatch = componente``), no una regla por tipo de cáncer en
código. Contrato SC-1 (design D10): ``no_coincide`` solo si la fuente trae un marcador de restricción explícito y el M
del paciente se puede leer; si no, ``desconocido`` y la población no queda no comparable. Los criterios se leen de la
fixture ``test-apl-1.3.0`` (copia del catálogo 1.11.0)."""

import dataclasses
from types import MappingProxyType

import pytest

from app.domain.aplicabilidad_tipos import ProyeccionDeEstado, ValorDePoblacion
from app.domain.applicability_rules import (
    criterio_evaluado,
    estado_de_poblacion,
    poblacion_no_comparable,
)
from app.domain.clasificacion_de_poblacion import codigos_del_paciente
from app.domain.criterios_aplicabilidad import CriterioDeAplicabilidad
from app.infrastructure.catalogo_clinico.aplicabilidad import cargar_criterios_de_aplicabilidad
from tests.support.catalogo_aplicabilidad import APL_1_3_0

EXTENSION: CriterioDeAplicabilidad = next(
    c
    for c in cargar_criterios_de_aplicabilidad(APL_1_3_0, ("prostata",)).criterios("prostata")
    if c.clave == "extension"
)
LOCALIZADA = "T2cN0M0"
METASTASICA = "T3aN1M1b"
SOLO_METASTASICA = "only metastatic prostate cancer"
SIN_REGLA = ProyeccionDeEstado(
    "desconocido", causa="sin_regla_de_comparacion", motivo_interno="valor_fuera_de_tabla"
)


def _elegible(valor: str, chunk: str = "ch-1") -> ValorDePoblacion:
    return ValorDePoblacion(valor, "elegibilidad", chunk)  # type: ignore[arg-type]


def _no_comparable(valores: list[ValorDePoblacion], valor_paciente: str | None) -> bool:
    proyeccion = estado_de_poblacion(valores, valor_paciente, EXTENSION)
    evaluado = criterio_evaluado(
        EXTENSION, valor_paciente, valores[0].valor, proyeccion, tuple(valores)
    )
    return poblacion_no_comparable([evaluado])


@pytest.mark.ac("US-121", 5)
def test_no_coincide_y_hace_la_poblacion_no_comparable_cuando_la_fuente_se_restringe_a_enfermedad_metastasica_y_el_paciente_tiene_enfermedad_localizada() -> (
    None
):
    valores = [_elegible(SOLO_METASTASICA)]

    assert estado_de_poblacion(valores, LOCALIZADA, EXTENSION) == ProyeccionDeEstado("no_coincide")
    assert _no_comparable(valores, LOCALIZADA) is True


@pytest.mark.ac("US-121", 5)
def test_queda_desconocido_sin_restriccion_explicita_cuando_la_fuente_nombra_enfermedad_metastasica_y_el_paciente_es_localizado() -> (
    None
):
    valores = [_elegible("metastatic prostate cancer")]

    assert estado_de_poblacion(valores, LOCALIZADA, EXTENSION) == ProyeccionDeEstado(
        "desconocido", causa="no_reportado_por_fuente"
    )
    assert _no_comparable(valores, LOCALIZADA) is False


@pytest.mark.ac("US-121", 5)
@pytest.mark.parametrize(
    "valores",
    [
        [_elegible("localized prostate cancer"), _elegible("locally advanced prostate cancer")],
        [_elegible("only locally advanced prostate cancer")],
        [_elegible("only localized prostate cancer")],
    ],
    ids=["ambas_sin_marcador", "solo_localmente_avanzada", "solo_localizada"],
)
def test_localizada_y_localmente_avanzada_no_se_excluyen_cuando_el_paciente_tiene_enfermedad_no_metastasica(
    valores: list[ValorDePoblacion],
) -> None:
    assert estado_de_poblacion(valores, LOCALIZADA, EXTENSION) == ProyeccionDeEstado("coincide")
    assert _no_comparable(valores, LOCALIZADA) is False


@pytest.mark.ac("US-121", 5)
@pytest.mark.parametrize("estadio", ["T2c", "IV", "II (sin TNM)", "T2cN0M10"])
def test_queda_desconocido_con_sin_regla_de_comparacion_y_no_hace_la_poblacion_no_comparable_cuando_el_estadio_no_permite_leer_m0_ni_m1(
    estadio: str,
) -> None:
    valores = [_elegible(SOLO_METASTASICA)]

    assert estado_de_poblacion(valores, estadio, EXTENSION) == SIN_REGLA
    assert _no_comparable(valores, estadio) is False


def test_queda_desconocido_por_falta_en_paciente_cuando_no_hay_stage_value() -> None:
    proyeccion = estado_de_poblacion([_elegible(SOLO_METASTASICA)], None, EXTENSION)

    assert proyeccion == ProyeccionDeEstado("desconocido", causa="falta_en_paciente")


def test_coincide_con_una_fuente_metastasica_cuando_el_paciente_tiene_m1_con_subindice() -> None:
    proyeccion = estado_de_poblacion([_elegible(SOLO_METASTASICA)], METASTASICA, EXTENSION)

    assert proyeccion == ProyeccionDeEstado("coincide")


@pytest.mark.parametrize(
    ("estadio", "esperado"),
    [
        (LOCALIZADA, {"no_metastasica"}),
        (METASTASICA, {"metastasica"}),
        ("T4N1M1a", {"metastasica"}),
        ("T2cN0M10", set()),
        ("T2c", set()),
    ],
    ids=["m0", "m1b", "m1a", "m10_no_es_m1", "sin_m"],
)
def test_lee_m0_o_m1_como_componente_del_estadio_cuando_el_criterio_declara_coincidencia_por_componente(
    estadio: str, esperado: set[str]
) -> None:
    assert codigos_del_paciente(estadio, EXTENSION) == frozenset(esperado)


def test_lee_la_alternativa_solo_al_inicio_cuando_el_criterio_no_declara_coincidencia_por_componente() -> (
    None
):
    regla = dataclasses.replace(
        EXTENSION.regla,
        equivalencias=MappingProxyType({"no_metastasica": ("M0",)}),
        coincidencia_de_equivalencias="prefijo",
    )
    criterio = dataclasses.replace(EXTENSION, regla=regla)

    assert codigos_del_paciente(LOCALIZADA, criterio) == frozenset()
    assert codigos_del_paciente("M0", criterio) == frozenset({"no_metastasica"})
