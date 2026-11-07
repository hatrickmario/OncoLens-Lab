"""Política contra el lenguaje de tendencia y valoración en una interpretación del chat (US-261, RN-23)."""

import pytest

from app.domain.chat.tendencia import tiene_verbo_de_tendencia


@pytest.mark.parametrize(
    "texto",
    [
        "El CA 15-3 subió entre ambos controles.",
        "El PSA SUBIO desde el diagnóstico.",
        "La paciente empeoró.",
        "El marcador mejoró y se ve favorable.",
        "El valor aumentó de 22 a 28 U/mL.",
        "El valor disminuyó respecto del control previo.",
        "Hubo una mejoría del estado funcional.",
        "El resultado es desfavorable.",
    ],
)
def test_tiene_verbo_de_tendencia_detecta_la_valoracion_cuando_el_texto_la_escribe(texto):
    assert tiene_verbo_de_tendencia(texto)


@pytest.mark.parametrize(
    "texto",
    [
        "El CA 15-3 registró 22 U/mL a los 30 días y 28 U/mL a los 90 días después del diagnóstico.",
        "La paciente tiene HER2 positivo 3+ desde el diagnóstico.",
        "El subtipo luminal no figura en el expediente.",
    ],
)
def test_tiene_verbo_de_tendencia_acepta_la_descripcion_cuando_solo_enumera_valores(texto):
    assert not tiene_verbo_de_tendencia(texto)
