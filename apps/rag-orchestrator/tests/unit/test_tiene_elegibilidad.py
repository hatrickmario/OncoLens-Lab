"""``tiene_elegibilidad()``: solo un valor de alcance ``elegibilidad`` cuenta (DEC-11, US-120 AC-7)."""

from __future__ import annotations

import pytest

from app.domain.aplicabilidad_tipos import CriterioDePoblacion, PoblacionDelEstudio, ValorDePoblacion
from app.domain.poblacion_del_estudio import tiene_elegibilidad


def _poblacion(*alcances: str, clave: str = "her2") -> PoblacionDelEstudio:
    valores = tuple(ValorDePoblacion("v", alcance, "c-1") for alcance in alcances)  # type: ignore[arg-type]
    return PoblacionDelEstudio("extraido_verificado", {clave: CriterioDePoblacion(valores)})


def test_cuenta_un_valor_de_alcance_elegibilidad() -> None:
    assert tiene_elegibilidad(_poblacion("elegibilidad"), "her2") is True


@pytest.mark.parametrize("alcance", ["mencion", "subgrupo"])
def test_no_cuenta_una_mencion_ni_un_subgrupo(alcance: str) -> None:
    assert tiene_elegibilidad(_poblacion(alcance), "her2") is False


def test_cuenta_si_algun_valor_es_de_elegibilidad_aunque_otros_sean_menciones() -> None:
    assert tiene_elegibilidad(_poblacion("mencion", "elegibilidad"), "her2") is True


def test_no_cuenta_una_clave_ausente_ni_una_poblacion_nula() -> None:
    assert tiene_elegibilidad(_poblacion("elegibilidad"), "otra") is False
    assert tiene_elegibilidad(None, "her2") is False
