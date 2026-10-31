"""Reglas puras del segundo loop de reescritura (US-238): disparo, términos del catálogo y pregunta original."""

import pytest

from app.domain.reescritura import (
    EstadoDeReescritura,
    MotivoDeReescritura,
    conservar_pregunta_original,
    debe_reescribir,
    filtrar_terminos_del_catalogo,
)

CATALOGO = frozenset({"ribociclib", "cdk4 6"})


def test_debe_reescribir_es_verdadero_cuando_el_primer_loop_quedo_vacio_y_esta_habilitada():
    assert debe_reescribir(0, True, 0, 1) is True


@pytest.mark.parametrize(
    ("sobre_umbral", "habilitada", "iteracion", "maximo"),
    [
        (1, True, 0, 1),  # el primer loop ya tiene evidencia
        (0, False, 0, 1),  # QUERY_REWRITE_ENABLED = false
        (0, True, 1, 1),  # sin tercer loop con MAX_ITERATIONS = 1
        (0, True, 0, 0),
    ],
)
def test_debe_reescribir_es_falso_cuando_no_se_cumple_alguna_condicion(
    sobre_umbral, habilitada, iteracion, maximo
):
    assert debe_reescribir(sobre_umbral, habilitada, iteracion, maximo) is False


def test_filtrar_terminos_conserva_solo_los_del_catalogo_normalizados_y_sin_repetir():
    propuestos = ["Ribociclib", "farmaco-inventado-x", "ribociclib", "CDK4/6"]

    assert filtrar_terminos_del_catalogo(propuestos, CATALOGO) == ("ribociclib", "cdk4 6")


def test_filtrar_terminos_devuelve_vacio_cuando_ninguno_esta_en_el_catalogo():
    assert filtrar_terminos_del_catalogo(["farmaco-inventado-x"], CATALOGO) == ()


def test_conservar_pregunta_original_suma_los_terminos_al_texto_de_busqueda_sin_cambiar_la_pregunta():
    consulta = conservar_pregunta_original("¿Qué dise la evidensia?", ("ribociclib",))

    assert consulta.texto_de_busqueda == "¿Qué dise la evidensia? ribociclib"
    assert consulta.pregunta_original == "¿Qué dise la evidensia?"


def test_estado_de_reescritura_solo_esta_aplicado_con_el_motivo_disparado():
    aplicados = {m for m in MotivoDeReescritura if EstadoDeReescritura(m).applied}

    assert aplicados == {MotivoDeReescritura.disparado}
