"""Artefactos de generación en el texto del LLM (ARR-08, revisión de fidelidad): caracteres de otra escritura y palabras rotas.

El NLI no los detecta (un «NSABP-B-3隀» sigue siendo implicado por el pasaje de B-31): se filtran de forma determinista.
"""

import pytest

from app.domain.calidad_de_texto import tiene_artefactos


@pytest.mark.parametrize(
    "texto",
    [
        "Los resultados del ensayo NSABP-B-3隀 fueron consistentes.",
        "Hombres de entre 55 y 7erm 74 años.",
        "Texto con carácter de reemplazo � en medio.",
        "Эффективность fue similar entre los grupos.",
        "El beneficio fue mayor 효과 en el grupo tratado.",
    ],
)
def test_detecta_un_artefacto_cuando_hay_caracteres_de_otra_escritura_o_una_palabra_rota(
    texto: str,
) -> None:
    assert tiene_artefactos(texto)


@pytest.mark.parametrize(
    "texto",
    [
        "El ensayo NSABP-B-31 reportó HR 0,76; IC 95 %, 0,68–0,86; p < 0,001.",
        "Los α-bloqueadores y los inhibidores de la 5-alfa-reductasa se describen por separado.",
        "Pacientes de ≥ 65 años con PSA > 10 ng/mL tratados con 5-fluorouracilo, 10 mg/día.",
        "La supervivencia libre de enfermedad a 10-year follow-up (HER2+, CDK4/6) mejoró 3rd línea.",
        "La dosis de 20 µg se administró a 2 cm de la lesión (T2N0M0).",
        "Tratamiento de 1.ª línea y de 2.º intento en 3.ª etapa.",
        "Estudio «PROSPER» (Gleason ≤ 7): « 12 meses » de seguimiento.",
    ],
)
def test_no_marca_como_artefacto_la_terminologia_clinica_legitima(texto: str) -> None:
    assert not tiene_artefactos(texto)
