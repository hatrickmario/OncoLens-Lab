"""Esquema que se entrega al LLM para la salida estructurada: afirmaciones atómicas por opción (US-245, D5-06).

La afirmación ``principal`` no lleva papel en el esquema: es la ÚNICA ``main_claim`` de la opción, así que la gramática del
runtime no puede producir dos (``principal_duplicada``) ni ninguna (``principal_ausente``). Las demás van en
``other_claims`` con papel ``secundaria`` o ``salvedad``.
"""

from app.application.generation import ESQUEMA_DE_GENERACION, esquema_de_generacion


def _opcion(esquema: dict) -> dict:
    return esquema["$defs"]["_OpcionPropuesta"]


def _adicionales(esquema: dict) -> dict:
    return _opcion(esquema)["properties"]["other_claims"]


def test_el_esquema_acota_las_afirmaciones_adicionales_al_rango_configurado_menos_la_central() -> None:
    adicionales = _adicionales(esquema_de_generacion(2, 3))

    assert (adicionales["minItems"], adicionales["maxItems"]) == (1, 2)


def test_el_esquema_admite_una_opcion_con_solo_la_afirmacion_central_cuando_el_minimo_es_uno() -> None:
    adicionales = _adicionales(esquema_de_generacion(1, 4))

    assert (adicionales["minItems"], adicionales["maxItems"]) == (0, 3)


def test_la_opcion_exige_nombre_afirmacion_central_y_lista_de_adicionales() -> None:
    opcion = _opcion(esquema_de_generacion(1, 4))

    assert set(opcion["required"]) == {"option", "main_claim", "other_claims"}


def test_la_afirmacion_central_exige_texto_y_citas_y_no_lleva_papel() -> None:
    central = esquema_de_generacion(1, 4)["$defs"]["_AfirmacionCentral"]

    assert set(central["required"]) == {"text", "citations"}
    assert "role" not in central["properties"]


def test_cada_afirmacion_adicional_exige_texto_papel_y_citas() -> None:
    adicional = esquema_de_generacion(1, 4)["$defs"]["_AfirmacionAdicional"]

    assert set(adicional["required"]) == {"text", "role", "citations"}


def test_el_papel_de_una_adicional_es_secundaria_o_salvedad_y_nunca_principal() -> None:
    papel = esquema_de_generacion(1, 4)["$defs"]["_AfirmacionAdicional"]["properties"]["role"]

    assert papel["enum"] == ["secundaria", "salvedad"]


def test_el_esquema_base_no_se_modifica_al_construir_la_variante_configurada() -> None:
    esquema_de_generacion(2, 3)

    assert "maxItems" not in _adicionales(ESQUEMA_DE_GENERACION)
