"""Chequeo numérico de una interpretación del chat (US-261, ADR-34): segunda barrera sin LLM ni NLI, antes del NLI.

Una cifra o unidad que la afirmación escribe y que no está en la descripción de los hechos que cita la delata como inventada
o cambiada: el NLI puede dejar pasar una paráfrasis con un número distinto, esta regla no.
"""

import pytest

from app.domain.chat.chequeo_numerico import cifras_sostenidas_por_la_descripcion
from app.domain.chat.descripcion_de_hechos import describir_hecho
from app.domain.chat.turno import HechoDelCaso

DESCRIPCION = (
    "CA 15-3: 22 U/mL, normal, 30 días después del diagnóstico. "
    "CA 15-3: 28 U/mL, normal, 90 días después del diagnóstico."
)


@pytest.mark.parametrize(
    "afirmacion",
    [
        "El CA 15-3 pasó de 22 U/mL a 28 U/mL entre los 30 y los 90 días después del diagnóstico.",
        "El CA 15-3 subió de 22 a 28 U/mL.",
        "A los 90 días después del diagnóstico el CA 15-3 era de 28 U/mL.",
        "El marcador permanece normal.",
    ],
)
def test_cifras_sostenidas_acepta_la_parafrasis_cuando_repite_las_cifras_y_unidades_de_la_descripcion(
    afirmacion,
):
    assert cifras_sostenidas_por_la_descripcion(afirmacion, DESCRIPCION)


def test_cifras_sostenidas_rechaza_la_afirmacion_cuando_cambia_el_valor():
    assert not cifras_sostenidas_por_la_descripcion("El CA 15-3 fue de 25 U/mL.", DESCRIPCION)


def test_cifras_sostenidas_rechaza_la_afirmacion_cuando_cambia_la_unidad_del_valor():
    assert not cifras_sostenidas_por_la_descripcion("El CA 15-3 fue de 22 ng/mL.", DESCRIPCION)


def test_cifras_sostenidas_rechaza_la_afirmacion_cuando_el_dia_no_es_el_de_ese_valor():
    afirmacion = "A los 60 días después del diagnóstico el CA 15-3 era de 28 U/mL."

    assert not cifras_sostenidas_por_la_descripcion(afirmacion, DESCRIPCION)


def test_cifras_sostenidas_rechaza_la_afirmacion_cuando_invierte_antes_y_despues():
    descripcion = "Cirugía conservadora, 40 días antes del diagnóstico."

    assert not cifras_sostenidas_por_la_descripcion(
        "La cirugía fue 40 días después del diagnóstico.", descripcion
    )
    assert cifras_sostenidas_por_la_descripcion(
        "La cirugía fue 40 días antes del diagnóstico.", descripcion
    )


def test_cifras_sostenidas_rechaza_la_afirmacion_cuando_inventa_una_cifra_sin_unidad():
    assert not cifras_sostenidas_por_la_descripcion("El CA 15-3 se midió 4 veces.", DESCRIPCION)


def test_cifras_sostenidas_acepta_la_coma_decimal_cuando_la_descripcion_usa_punto():
    descripcion = "PSA: 0.5 ng/mL, normal, 10 días después del diagnóstico."

    assert cifras_sostenidas_por_la_descripcion("El PSA fue de 0,5 ng/mL.", descripcion)
    assert not cifras_sostenidas_por_la_descripcion("El PSA fue de 0,6 ng/mL.", descripcion)


def test_cifras_sostenidas_ignora_los_ceros_a_la_derecha_cuando_el_valor_es_el_mismo():
    assert cifras_sostenidas_por_la_descripcion(
        "El PSA fue de 4,20 ng/mL.", "PSA: 4.2 ng/mL, 5 días después del diagnóstico."
    )


def test_cifras_sostenidas_ignora_el_signo_cuando_la_cifra_es_la_misma():
    assert cifras_sostenidas_por_la_descripcion(
        "Hace -40 días hubo una cirugía.", "Cirugía, 40 días antes del diagnóstico."
    )


@pytest.mark.parametrize(
    ("afirmacion", "descripcion"),
    [
        (
            "La paciente tiene HER2 positivo por inmunohistoquímica.",
            "HER2: 3+ (IHQ), relevante, al momento del diagnóstico.",
        ),
        (
            "El estadio es IIA con ECOG 1.",
            "Carcinoma, estadio IIA (TNM_8), ECOG 1, al momento del diagnóstico.",
        ),
        (
            "El estadio IIA se clasificó con TNM 8.",
            "Carcinoma, estadio IIA (TNM_8), ECOG 1, al momento del diagnóstico.",
        ),
        (
            "El tumor es T2cN0M0.",
            "Adenocarcinoma, estadio T2cN0M0 (TNM_8), ECOG 0, al momento del diagnóstico.",
        ),
    ],
)
def test_cifras_sostenidas_no_cuenta_los_digitos_pegados_a_letras_o_guion_bajo_como_cifras_de_la_afirmacion(
    afirmacion, descripcion
):
    assert cifras_sostenidas_por_la_descripcion(afirmacion, descripcion)


def test_cifras_sostenidas_acepta_la_cifra_sin_unidad_cuando_esta_en_la_descripcion():
    assert cifras_sostenidas_por_la_descripcion(
        "Tiene ECOG 1 y un Ki-67 de 20 %.", "ECOG 1, Ki-67: 20 %, 5 días después del diagnóstico."
    )


def test_cifras_sostenidas_compara_los_dos_extremos_de_un_rango_cuando_la_afirmacion_lo_escribe():
    descripcion = "Rango de dosis: 10-12 mg, 3 días después del diagnóstico."

    assert cifras_sostenidas_por_la_descripcion("La dosis fue de 10-12 mg.", descripcion)
    assert not cifras_sostenidas_por_la_descripcion("La dosis fue de 10-14 mg.", descripcion)


def test_cifras_sostenidas_acepta_la_afirmacion_sin_cifras_cuando_la_descripcion_las_tiene():
    assert cifras_sostenidas_por_la_descripcion("Hubo una cirugía.", "Cirugía, 40 días antes.")


def test_cifras_sostenidas_rechaza_la_afirmacion_cuando_cambia_mg_por_microgramos():
    assert not cifras_sostenidas_por_la_descripcion("Recibió 5 µg", "Recibió 5 mg")
    assert cifras_sostenidas_por_la_descripcion("Recibió 5 µg", "Recibió 5 µg")


def test_cifras_sostenidas_trata_punto_y_coma_siempre_como_decimal_cuando_la_cifra_trae_miles():
    # Política: «1.200» es 1,2 (decimal); no hay separador de miles en las verbalizaciones del expediente.
    assert cifras_sostenidas_por_la_descripcion(
        "El valor fue 1,2 U/mL.", "Valor: 1.200 U/mL, 5 días antes."
    )
    assert not cifras_sostenidas_por_la_descripcion(
        "El valor fue 1200 U/mL.", "Valor: 1.200 U/mL, 5 días antes."
    )


def test_cifras_sostenidas_no_compara_cifras_en_palabras_ni_unidades_fuera_de_la_lista():
    assert cifras_sostenidas_por_la_descripcion("Recibió tres ciclos de 5 UFC.", "Recibió 5 UFC.")


def test_cifras_sostenidas_rechaza_el_cambio_de_sentido_del_momento_que_escribe_describir_hecho():
    hecho = HechoDelCaso("f1", "Cirugía", -40, "verificado")
    descripcion = describir_hecho(hecho)

    cambiada = descripcion.replace("antes", "después")

    assert cambiada != descripcion
    assert not cifras_sostenidas_por_la_descripcion(cambiada, descripcion)
    assert cifras_sostenidas_por_la_descripcion(descripcion, descripcion)
