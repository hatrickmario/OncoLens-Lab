"""RN-22: la longitud máxima del código de tipo de cáncer es configuración, no una constante del código."""

import pytest
from pydantic import ValidationError

from app.bootstrap import _parametros_de_recuperacion
from tests.support.fakes import settings_de_prueba


def _settings(**cambios):
    return settings_de_prueba(nli_model="nli-test@1", prompt_version="rag-query@test", **cambios)


def test_settings_usa_64_como_longitud_maxima_del_codigo_cuando_el_entorno_no_la_fija():
    assert _settings().retrieval_cancer_type_max_length == 64


@pytest.mark.parametrize("valor", [0, -1])
def test_settings_rechaza_una_longitud_maxima_no_positiva(valor):
    with pytest.raises(ValidationError):
        _settings(retrieval_cancer_type_max_length=valor)


def test_los_parametros_de_recuperacion_llevan_la_longitud_maxima_de_settings():
    parametros = _parametros_de_recuperacion(_settings(retrieval_cancer_type_max_length=7))

    assert parametros.longitud_maxima_codigo_tipo == 7
