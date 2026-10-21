"""Esquema que se entrega al LLM para la salida estructurada (ARR-08): sin `required`, el modelo nunca emite `details`."""

from app.application.generation import ESQUEMA_DE_GENERACION, esquema_de_generacion


def _opcion(esquema: dict) -> dict:
    return esquema["$defs"]["_OpcionCruda"]


def test_el_esquema_con_detalle_exige_details_y_lo_acota_al_maximo_de_parrafos_configurado() -> (
    None
):
    opcion = _opcion(esquema_de_generacion(2))

    assert "details" in opcion["required"]
    assert opcion["properties"]["details"]["maxItems"] == 2


def test_el_esquema_sin_detalle_no_ofrece_el_campo_cuando_el_maximo_es_cero() -> None:
    opcion = _opcion(esquema_de_generacion(0))

    assert "details" not in opcion["properties"]
    assert "details" not in opcion["required"]


def test_el_esquema_base_no_se_modifica_al_construir_la_variante_con_detalle() -> None:
    esquema_de_generacion(2)

    assert "details" not in _opcion(ESQUEMA_DE_GENERACION)["required"]
