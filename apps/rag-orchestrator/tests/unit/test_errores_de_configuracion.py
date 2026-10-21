"""Un fallo de configuración se describe con variable, regla y motivo, nunca con el valor recibido (US-037 AC-2)."""

import pytest
from pydantic import BaseModel, Field, ValidationError, field_validator

from app.config.errores_de_configuracion import describir_errores


class _Config(BaseModel):
    umbral: float = Field(ge=0.0, le=1.0)
    obligatoria: int

    @field_validator("obligatoria")
    @classmethod
    def _repite_el_valor(cls, valor: int) -> int:
        raise ValueError(f"no puede ser {valor}")


def _errores(**datos) -> list[dict[str, str]]:
    with pytest.raises(ValidationError) as error:
        _Config(**datos)
    return describir_errores(error.value)


def test_describir_errores_nombra_la_variable_en_mayusculas_y_la_regla_de_rango():
    eventos = _errores(umbral="1.7", obligatoria=1)

    umbral = next(e for e in eventos if e["variable"] == "UMBRAL")
    assert umbral["motivo"] == "valor_invalido"
    assert "1.7" not in umbral["regla"]
    assert "less than or equal" in umbral["regla"]


def test_describir_errores_marca_variable_ausente_cuando_falta_una_clave_obligatoria():
    eventos = _errores(umbral=0.5)

    assert eventos == [
        {"motivo": "variable_ausente", "regla": "Field required", "variable": "OBLIGATORIA"}
    ]


def test_describir_errores_sustituye_la_regla_por_su_tipo_cuando_el_mensaje_repite_el_valor():
    eventos = _errores(umbral=0.5, obligatoria=987654)

    assert eventos[0]["regla"] == "value_error"
    assert "987654" not in str(eventos)
