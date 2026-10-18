"""Traducción de fallos del runtime al error del puerto (US-231a AC-5)."""

import pytest

from app.application.ports import FalloDeInferencia
from app.infrastructure.models.fallos import fallos_de_inferencia_como_error_del_puerto


def test_un_fallo_cualquiera_sale_como_el_error_del_puerto_con_el_mensaje_propio_y_sin_causa() -> (
    None
):
    with pytest.raises(FalloDeInferencia) as error:
        with fallos_de_inferencia_como_error_del_puerto("etapa: fallo"):
            raise RuntimeError("texto clínico y /ruta/secreta")

    assert str(error.value) == "etapa: fallo"
    assert error.value.__cause__ is None and error.value.__suppress_context__ is True


def test_el_error_del_puerto_pasa_intacto() -> None:
    original = FalloDeInferencia("forma de salida inesperada")

    with pytest.raises(FalloDeInferencia) as error:
        with fallos_de_inferencia_como_error_del_puerto("otro mensaje"):
            raise original

    assert error.value is original


def test_un_bloque_sin_fallos_no_cambia_nada() -> None:
    with fallos_de_inferencia_como_error_del_puerto("x"):
        resultado = 1 + 1

    assert resultado == 2
