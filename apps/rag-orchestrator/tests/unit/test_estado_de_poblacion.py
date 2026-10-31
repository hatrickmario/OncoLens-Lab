"""Tabla de casos de la función pura ``estado_de_poblacion`` (US-243 AC-8): misma entrada, misma salida, sin LLM ni puntaje.

Los criterios se arman como los lee el catálogo (sinónimos, marcadores de restricción, escala y grupos); ningún literal vive
en el dominio (RN-22, RN-27)."""

import dataclasses
import pytest

from app.domain.aplicabilidad_tipos import ProyeccionDeEstado, ValorDePoblacion
from app.domain.applicability_rules import estado_de_poblacion
from tests.support.criterios_poblacion import (
    ECOG,
    ESTADIO_CON_ESCALA,
    ESTADIO_SIN_ESCALA,
    HER2,
    MENOPAUSIA,
    RECEPTORES,
)


def _elegible(valor: str, chunk: str = "ch-1") -> ValorDePoblacion:
    return ValorDePoblacion(valor, "elegibilidad", chunk)


def _parcial(motivo: str) -> ProyeccionDeEstado:
    return ProyeccionDeEstado("parcial", motivo_parcial=motivo)  # type: ignore[arg-type]


def _desconocido(causa: str, motivo: str | None = None) -> ProyeccionDeEstado:
    return ProyeccionDeEstado("desconocido", causa=causa, motivo_interno=motivo)  # type: ignore[arg-type]


# (criterio, valores, valor del paciente, diseño de la fuente, proyección esperada)
CASOS = {
    "exacto": (
        MENOPAUSIA,
        [_elegible("postmenopausal women")],
        "posmenopáusica",
        None,
        ProyeccionDeEstado("coincide"),
    ),
    "inclusivo": (
        MENOPAUSIA,
        [_elegible("premenopausal women"), _elegible("postmenopausal women")],
        "posmenopáusica",
        None,
        _parcial("inclusiva"),
    ),
    "mezclado": (
        MENOPAUSIA,
        [_elegible("premenopausal women"), _elegible("postmenopausal women")],
        "posmenopáusica",
        "guia",
        _parcial("mezclada"),
    ),
    "rango_solapado": (
        ESTADIO_CON_ESCALA,
        [_elegible("IIB–IIIA")],
        "II",
        None,
        _parcial("rango_solapado"),
    ),
    "solo_subgrupo_forma_antigua": (
        ECOG,
        [ValorDePoblacion("0-1", "subgrupo", None)],
        "1",
        None,
        _parcial("solo_subgrupo"),
    ),
    "en_conflicto": (
        HER2,
        [_elegible("HER2-positive (IHC 3+)", "ch-1"), _elegible("HER2-negative", "ch-2")],
        "3+ (IHQ)",
        None,
        _desconocido("valores_en_conflicto"),
    ),
    "ausente": (MENOPAUSIA, [], "posmenopáusica", None, _desconocido("no_reportado_por_fuente")),
    "solo_subgrupo_forma_nueva": (
        RECEPTORES,
        [ValorDePoblacion("triple-negative (TNBC)", "subgrupo", "ch-1")],
        "RE: Positivo (80%); RP: Positivo (60%)",
        None,
        _desconocido("no_reportado_por_fuente"),
    ),
    "restriccion": (
        MENOPAUSIA,
        [_elegible("postmenopausal women only")],
        "premenopáusica",
        None,
        ProyeccionDeEstado("no_coincide"),
    ),
    "lista_incompleta_sin_restriccion": (
        MENOPAUSIA,
        [_elegible("postmenopausal women")],
        "premenopáusica",
        None,
        _desconocido("no_reportado_por_fuente"),
    ),
    "valor_fuera_de_tabla": (
        ESTADIO_CON_ESCALA,
        [_elegible("IV–V")],
        "IIA",
        None,
        _desconocido("sin_regla_de_comparacion", "valor_fuera_de_tabla"),
    ),
    "sin_escala": (
        ESTADIO_SIN_ESCALA,
        [_elegible("I–III")],
        "IIA",
        None,
        _desconocido("sin_regla_de_comparacion", "sin_escala"),
    ),
    "forma_no_comparable": (
        RECEPTORES,
        [_elegible("hormone receptor-positive")],
        "RE: Positivo (80%); RP: Positivo (60%)",
        None,
        _desconocido("sin_regla_de_comparacion", "forma_no_comparable"),
    ),
    "falta_en_paciente": (
        MENOPAUSIA,
        [_elegible("postmenopausal women")],
        None,
        None,
        _desconocido("falta_en_paciente"),
    ),
}


@pytest.mark.ac("US-243", 8)
@pytest.mark.parametrize("caso", CASOS, ids=list(CASOS))
def test_estado_de_poblacion_proyecta_el_estado_y_el_motivo_esperados_y_es_identico_al_repetirlo(
    caso: str,
) -> None:
    criterio, valores, valor_paciente, diseno, esperado = CASOS[caso]

    primero = estado_de_poblacion(valores, valor_paciente, criterio, diseno_de_la_fuente=diseno)
    segundo = estado_de_poblacion(valores, valor_paciente, criterio, diseno_de_la_fuente=diseno)

    assert primero == esperado
    assert segundo == primero


@pytest.mark.ac("US-243", 8)
@pytest.mark.parametrize("caso", CASOS, ids=list(CASOS))
def test_estado_de_poblacion_no_trae_puntaje_ni_porcentaje_cuando_se_proyecta_cualquier_caso(
    caso: str,
) -> None:
    criterio, valores, valor_paciente, diseno, _ = CASOS[caso]

    campos = {
        f.name
        for f in dataclasses.fields(
            estado_de_poblacion(valores, valor_paciente, criterio, diseno_de_la_fuente=diseno)
        )
    }

    assert campos == {"estado", "motivo_parcial", "causa", "motivo_interno"}
