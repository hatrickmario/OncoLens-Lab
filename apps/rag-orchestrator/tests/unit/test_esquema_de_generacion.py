"""Esquema que se entrega al LLM para la salida estructurada: afirmaciones atómicas por opción (US-245)."""

from app.application.generation import ESQUEMA_DE_GENERACION, esquema_de_generacion


def _claims(esquema: dict) -> dict:
    return esquema["$defs"]["_OpcionCruda"]["properties"]["claims"]


def test_el_esquema_acota_las_afirmaciones_por_opcion_al_rango_configurado() -> None:
    claims = _claims(esquema_de_generacion(2, 3))

    assert (claims["minItems"], claims["maxItems"]) == (2, 3)


def test_el_esquema_exige_en_cada_afirmacion_texto_papel_y_citas() -> None:
    afirmacion = esquema_de_generacion(1, 4)["$defs"]["_AfirmacionCruda"]

    assert set(afirmacion["required"]) == {"text", "role", "citations"}
    assert set(afirmacion["properties"]["role"]["$ref"].split("/")[-1:]) == {"PapelDeAfirmacion"}


def test_el_esquema_ofrece_los_tres_papeles() -> None:
    papeles = esquema_de_generacion(1, 4)["$defs"]["PapelDeAfirmacion"]["enum"]

    assert papeles == ["principal", "secundaria", "salvedad"]


def test_el_esquema_base_no_se_modifica_al_construir_la_variante_configurada() -> None:
    esquema_de_generacion(2, 3)

    assert "maxItems" not in _claims(ESQUEMA_DE_GENERACION)
