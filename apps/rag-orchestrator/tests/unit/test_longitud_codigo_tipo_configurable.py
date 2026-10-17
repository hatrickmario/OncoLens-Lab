"""RN-22: la longitud máxima del código de tipo de cáncer es configuración, no una constante del código."""

import dataclasses

import pytest
from pydantic import ValidationError

from app.bootstrap import _parametros_de_recuperacion
from app.domain.retrieval_filter import LONGITUD_MAXIMA_POR_DEFECTO
from tests.support.fakes import settings_de_prueba
from tests.support.recuperacion import (
    PARAMETROS_DE_PRUEBA,
    Q_HER2,
    BuscadorFalso,
    ChunkFx,
    crear_entorno,
    solicitud_de,
)


def _settings(**cambios):
    return settings_de_prueba(nli_model="nli-test@1", prompt_version="rag-query@test", **cambios)


def test_settings_usa_64_como_longitud_maxima_del_codigo_cuando_el_entorno_no_la_fija():
    assert _settings().retrieval_cancer_type_max_length == LONGITUD_MAXIMA_POR_DEFECTO == 64


@pytest.mark.parametrize("valor", [0, -1])
def test_settings_rechaza_una_longitud_maxima_no_positiva(valor):
    with pytest.raises(ValidationError):
        _settings(retrieval_cancer_type_max_length=valor)


def test_los_parametros_de_recuperacion_llevan_la_longitud_maxima_de_settings():
    parametros = _parametros_de_recuperacion(_settings(retrieval_cancer_type_max_length=7))

    assert parametros.longitud_maxima_codigo_tipo == 7


def test_rag_query_responde_422_tipo_cancer_no_registrado_cuando_el_codigo_excede_la_longitud_configurada():
    parametros = dataclasses.replace(PARAMETROS_DE_PRUEBA, longitud_maxima_codigo_tipo=4)
    entorno = crear_entorno(parametros=parametros)

    respuesta = entorno.consultar(solicitud_de(Q_HER2, tipo_de_cancer="mama_x"))

    assert respuesta.status_code == 422
    assert respuesta.json()["error"] == "TIPO_CANCER_NO_REGISTRADO"
    assert entorno.buscador.invocaciones == 0


def test_rag_query_llega_al_buscador_cuando_el_codigo_excede_el_defecto_pero_cabe_en_la_longitud_configurada():
    tipo = "t" * 70
    parametros = dataclasses.replace(PARAMETROS_DE_PRUEBA, longitud_maxima_codigo_tipo=80)
    chunk = ChunkFx("ch-largo-1", "doc-largo", "texto sintético", [1.0] + [0.0] * 7, True, tipo)
    entorno = crear_entorno(parametros=parametros, buscador=BuscadorFalso(chunks=[chunk]))

    respuesta = entorno.consultar(solicitud_de(Q_HER2, tipo_de_cancer=tipo))

    assert respuesta.status_code == 200
    assert entorno.buscador.invocaciones >= 1
