"""`normalizar_pregunta` recorre la tabla compartida con el gemelo TS (US-250): los dos dan la misma salida."""

import json

import pytest

from app.domain.pregunta import normalizar_pregunta
from tests.support.contract import RAIZ_REPOSITORIO

TABLA = RAIZ_REPOSITORIO / "packages/clinical-language/fixtures/normalizacion-pregunta.json"


def _casos() -> list:
    casos = json.loads(TABLA.read_text(encoding="utf-8"))["casos"]
    return [pytest.param(c, id=c["nombre"]) for c in casos]


@pytest.mark.parametrize("caso", _casos())
def test_normalizar_pregunta_da_la_salida_de_la_tabla_compartida(caso):
    repetir = caso.get("repetir", 1)

    assert normalizar_pregunta(caso["entrada"] * repetir) == caso["esperada"] * repetir


def test_normalizar_pregunta_conserva_el_bom_en_los_bordes():
    # U+FEFF no es espacio para la regla (trim() de JS lo quitaría y divergiría del gemelo TS).
    bom = chr(0xFEFF)

    assert normalizar_pregunta(f" {bom}HER2{bom} ") == f"{bom}HER2{bom}"
