"""División determinista de una justificación en afirmaciones (L1D-180 D1, RN-01)."""

from __future__ import annotations

import pytest

from app.domain.claims import dividir_en_afirmaciones


def test_una_oracion_es_una_sola_afirmacion() -> None:
    assert dividir_en_afirmaciones("La terapia mejoró la supervivencia.") == (
        "La terapia mejoró la supervivencia.",
    )


def test_un_texto_sin_punto_final_es_una_afirmacion() -> None:
    assert dividir_en_afirmaciones("reduce la mortalidad a la mitad") == (
        "reduce la mortalidad a la mitad",
    )


@pytest.mark.parametrize("terminador", [".", ";", "?", "!"])
def test_cada_terminador_seguido_de_espacio_parte_el_texto_en_dos_afirmaciones(
    terminador: str,
) -> None:
    texto = f"Primera afirmación{terminador} Segunda afirmación"

    assert dividir_en_afirmaciones(texto) == (
        f"Primera afirmación{terminador}",
        "Segunda afirmación",
    )


@pytest.mark.parametrize("numero", ["0,5", "0.5", "95.4"])
def test_un_decimal_no_parte_la_afirmacion(numero: str) -> None:
    texto = f"El hazard ratio fue {numero} en el grupo tratado."

    assert dividir_en_afirmaciones(texto) == (texto,)


def test_una_abreviatura_de_la_lista_no_parte_la_afirmacion() -> None:
    texto = "Se describen opciones (p. ej. la terapia dirigida) en la guía. Otra afirmación."

    assert dividir_en_afirmaciones(texto) == (
        "Se describen opciones (p. ej. la terapia dirigida) en la guía.",
        "Otra afirmación.",
    )


def test_recorta_espacios_y_descarta_los_fragmentos_vacios() -> None:
    assert dividir_en_afirmaciones("  Uno.    Dos.  ") == ("Uno.", "Dos.")


@pytest.mark.parametrize("texto", ["", "   ", "\n"])
def test_un_texto_vacio_no_tiene_afirmaciones(texto: str) -> None:
    assert dividir_en_afirmaciones(texto) == ()
