"""Arranque sin telemetría de LangChain (L1D-316, privacy-guardian Gate 2 #3): langsmith viaja con langgraph y enviaría
trazas de la conversación fuera si el trazado estuviera encendido (RN-10, RN-12)."""

import pytest

from app.bootstrap import crear_app
from app.config.telemetria import (
    VARIABLES_DE_TELEMETRIA,
    TelemetriaDeLangChainActiva,
    exigir_telemetria_de_langchain_apagada,
)
from tests.support.fakes import settings_de_prueba


@pytest.mark.parametrize("variable", VARIABLES_DE_TELEMETRIA)
@pytest.mark.parametrize("valor", ["true", "TRUE", "1", "yes"])
def test_crear_app_se_niega_nombrando_la_variable_cuando_el_trazado_de_langchain_esta_encendido(
    variable, valor, monkeypatch
):
    monkeypatch.setenv(variable, valor)

    with pytest.raises(TelemetriaDeLangChainActiva) as error:
        crear_app(settings_de_prueba())

    mensaje = str(error.value)
    assert variable in mensaje
    assert f"={valor}" not in mensaje and f"'{valor}'" not in mensaje and f'"{valor}"' not in mensaje


@pytest.mark.parametrize("valor", ["false", "0", "", "no"])
def test_arranca_cuando_el_trazado_de_langchain_esta_apagado_o_vacio(valor, monkeypatch):
    monkeypatch.setenv("LANGSMITH_TRACING", valor)
    monkeypatch.setenv("LANGCHAIN_TRACING_V2", valor)

    assert crear_app(settings_de_prueba()) is not None


def test_exigir_telemetria_apagada_acepta_un_entorno_sin_las_variables():
    exigir_telemetria_de_langchain_apagada({})
