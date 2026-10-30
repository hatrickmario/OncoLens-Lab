"""Lectura de `population_criteria` del catálogo (L1D-127, US-241, privacy): solo un objeto JSON es una población válida."""

import pytest

from app.config.settings import POBLACION_MAX_VALORES_POR_CRITERIO_INICIAL as MAX_VALORES
from app.domain.aplicabilidad_tipos import CriterioDePoblacion, ValorDePoblacion
from app.infrastructure.catalog.catalogo_reader import _poblacion_de_fila


def test_poblacion_de_fila_copia_el_valor_y_el_origen_cuando_population_criteria_es_un_objeto():
    fila = {"population_criteria": {"ecog": "0-1"}, "metadata_source": "pendiente"}

    poblacion = _poblacion_de_fila(fila, MAX_VALORES)

    assert poblacion.metadata_source == "pendiente"
    assert dict(poblacion.criterios) == {
        "ecog": CriterioDePoblacion((ValorDePoblacion("0-1", "elegibilidad", None),))
    }


@pytest.mark.parametrize("corrupto", [["0-1"], "0-1", 1, None])
def test_poblacion_de_fila_lanza_error_sin_el_contenido_cuando_population_criteria_no_es_un_objeto(
    corrupto: object,
):
    fila = {"population_criteria": corrupto, "metadata_source": "SENTINELA-FILA"}

    with pytest.raises(ValueError, match="no es un objeto JSON") as error:
        _poblacion_de_fila(fila, MAX_VALORES)

    assert "SENTINELA" not in str(error.value)
