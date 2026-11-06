"""Descripción determinista de los hechos del caso (US-260, ADR-34, RN-25): una sola frase completa por hecho."""

from app.domain.chat.descripcion_de_hechos import (
    describir_hecho,
    describir_hechos,
    es_la_descripcion_de,
)
from app.domain.chat.turno import HechoDelCaso


def _hecho(
    ref: str = "f1",
    verbalizacion: str = "CA 15-3: 22 U/mL, normal",
    dia: int | None = 30,
    estado: str = "verificado",
    conflicto: str | None = None,
) -> HechoDelCaso:
    return HechoDelCaso(ref, verbalizacion, dia, estado, conflicto)


def test_describir_hecho_escribe_una_frase_completa_con_el_dia_relativo_cuando_el_dato_es_posterior_al_diagnostico():
    assert (
        describir_hecho(_hecho())
        == "CA 15-3: 22 U/mL, normal, 30 días después del diagnóstico."
    )


def test_describir_hecho_usa_singular_cuando_el_dato_es_del_dia_siguiente():
    assert describir_hecho(_hecho(dia=1)).endswith("1 día después del diagnóstico.")


def test_describir_hecho_dice_al_momento_del_diagnostico_cuando_el_dia_relativo_es_cero():
    assert describir_hecho(_hecho(dia=0)).endswith("al momento del diagnóstico.")


def test_describir_hecho_dice_antes_del_diagnostico_cuando_el_dia_relativo_es_negativo():
    assert describir_hecho(_hecho(dia=-12)).endswith("12 días antes del diagnóstico.")


def test_describir_hecho_dice_sin_fecha_confiable_y_no_cero_cuando_el_dia_relativo_es_null():
    frase = describir_hecho(_hecho(dia=None))

    assert frase.endswith("sin fecha confiable.")
    assert "al momento" not in frase


def test_describir_hecho_marca_requiere_revision_cuando_el_dato_esta_en_ese_estado():
    assert (
        describir_hecho(_hecho(estado="requiere_revision"))
        == "CA 15-3: 22 U/mL, normal, 30 días después del diagnóstico, requiere revisión."
    )


def test_describir_hecho_no_marca_sin_verificar_cuando_el_dato_esta_auto_aceptado():
    frase = describir_hecho(_hecho(estado="auto_aceptado"))

    assert "revisión" not in frase and "verificar" not in frase
    assert "auto_aceptado" not in frase


def test_describir_hecho_marca_el_conflicto_sin_escribir_el_factref_del_otro_dato():
    frase = describir_hecho(_hecho(conflicto="f4"))

    assert "en conflicto con otro dato" in frase
    assert "f4" not in frase


def test_describir_hecho_pone_la_primera_letra_en_mayuscula_cuando_la_verbalizacion_empieza_en_minuscula():
    frase = describir_hecho(_hecho(verbalizacion="carcinoma ductal infiltrante, ECOG 1", dia=0))

    assert frase.startswith("Carcinoma ductal infiltrante")


def test_describir_hechos_une_las_frases_en_el_orden_de_la_cita_y_sin_repetir():
    hechos = [_hecho("f1", "Dx", 0), _hecho("f2", "HER2: 3+", 0)]

    assert describir_hechos(["f2", "f1", "f2"], hechos) == (
        "HER2: 3+, al momento del diagnóstico. Dx, al momento del diagnóstico."
    )


def test_es_la_descripcion_de_acepta_la_frase_identica_aunque_cambien_mayusculas_espacios_y_punto_final():
    hechos = [_hecho()]

    assert es_la_descripcion_de(
        "  ca 15-3: 22 u/ml,  normal, 30 días después del diagnóstico ", ["f1"], hechos
    )


def test_es_la_descripcion_de_rechaza_la_parafrasis_y_el_dato_inventado():
    hechos = [_hecho()]

    assert not es_la_descripcion_de("El CA 15-3 fue de 22 U/mL.", ["f1"], hechos)
    assert not es_la_descripcion_de(
        "CA 15-3: 23 U/mL, normal, 30 días después del diagnóstico.", ["f1"], hechos
    )
