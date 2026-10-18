"""Detección de idioma por palabras funcionales (US-231a AC-4): reglas puras."""

import pytest

from app.domain.idioma import (
    PALABRAS_FUNCIONALES_EN,
    PALABRAS_FUNCIONALES_ES,
    detectar_idioma,
)


def test_detecta_espanol_por_sus_palabras_funcionales() -> None:
    assert detectar_idioma("Qué describe la evidencia sobre el melanoma", "en") == "es"


def test_detecta_ingles_por_sus_palabras_funcionales() -> None:
    assert (
        detectar_idioma("The effect of therapy on survival is described in the trial", "es") == "en"
    )


def test_los_signos_y_vocales_del_espanol_suman_al_espanol() -> None:
    assert detectar_idioma("¿HER2 cáncer?", "en") == "es"


def test_un_texto_vacio_es_indeterminado_y_usa_el_idioma_por_defecto() -> None:
    assert detectar_idioma("", "es") == "es"
    assert detectar_idioma("", "en") == "en"


def test_un_texto_sin_palabras_funcionales_usa_el_idioma_por_defecto() -> None:
    assert detectar_idioma("HER2 BRCA1 TNM", "en") == "en"
    assert detectar_idioma("HER2 BRCA1 TNM", "es") == "es"


def test_un_empate_usa_el_idioma_por_defecto() -> None:
    assert detectar_idioma("the de", "es") == "es"
    assert detectar_idioma("the de", "en") == "en"


def test_gana_el_idioma_con_mas_palabras_funcionales_en_un_texto_mixto() -> None:
    assert detectar_idioma("the effect of la terapia en pacientes con cáncer de mama", "en") == "es"


def test_el_resultado_es_el_mismo_en_llamadas_sucesivas() -> None:
    texto = "Cardiac function should be monitored during anti-HER2 therapy"

    assert {detectar_idioma(texto, "es") for _ in range(20)} == {"en"}


def test_las_listas_no_comparten_ninguna_palabra() -> None:
    assert PALABRAS_FUNCIONALES_ES & PALABRAS_FUNCIONALES_EN == frozenset()


@pytest.mark.parametrize("palabra", ["a", "no", "me"])
def test_las_palabras_ambiguas_no_puntuan_para_ningun_idioma(palabra: str) -> None:
    assert palabra not in PALABRAS_FUNCIONALES_ES | PALABRAS_FUNCIONALES_EN
