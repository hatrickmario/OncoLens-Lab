"""El generador falla cerrado como `503 LOCAL_LLM_UNAVAILABLE` del contrato, sin detalle ni eco (RN-10, RN-12)."""

import logging

import pytest

from app.application.errores import (
    LlmLocalNoDisponibleError,
    RecuperacionNoDisponibleError,
    TipoCancerNoRegistradoError,
)
from tests.support.contract import assert_matches_spec
from tests.support.recuperacion import Q_HER2, GeneradorFalso, crear_entorno, solicitud_de

SENTINELA_MODELO = "SENTINELA-DETALLE-DEL-MODELO-3K"


class _GeneradorQueExplota(GeneradorFalso):
    async def generar(self, solicitud, recuperacion):
        raise RuntimeError(f"{SENTINELA_MODELO} {solicitud.query}")


class _GeneradorQueDevuelve(GeneradorFalso):
    def __init__(self, valor: object) -> None:
        super().__init__()
        self._valor = valor

    async def generar(self, solicitud, recuperacion):
        return self._valor


def test_rag_query_responde_503_del_contrato_sin_eco_cuando_el_generador_lanza_un_error_inesperado(
    caplog,
):
    solicitud = solicitud_de(Q_HER2)
    entorno = crear_entorno(generador=_GeneradorQueExplota())
    caplog.set_level(logging.DEBUG)

    respuesta = entorno.consultar(solicitud)

    assert respuesta.status_code == 503
    assert_matches_spec("#/paths/~1rag~1query/post/responses/503", respuesta.json())
    assert respuesta.json()["error"] == "LOCAL_LLM_UNAVAILABLE"
    formateador = logging.Formatter()
    for registro in caplog.records:
        texto = registro.getMessage()
        if registro.exc_info:
            texto += formateador.formatException(registro.exc_info)
        assert SENTINELA_MODELO not in texto
        assert Q_HER2 not in texto
    assert any("event=generacion_fallo" in r.getMessage() for r in caplog.records)


@pytest.mark.parametrize(
    ("error", "estado", "codigo"),
    [
        (RecuperacionNoDisponibleError("generacion"), 503, "RETRIEVAL_UNAVAILABLE"),
        (TipoCancerNoRegistradoError(), 422, "TIPO_CANCER_NO_REGISTRADO"),
        (LlmLocalNoDisponibleError(), 503, "LOCAL_LLM_UNAVAILABLE"),
    ],
)
def test_rag_query_conserva_el_error_de_aplicacion_cuando_el_generador_lo_lanza(
    error, estado, codigo
):
    class _GeneradorQueLanza(GeneradorFalso):
        async def generar(self, solicitud, recuperacion):
            raise error

    respuesta = crear_entorno(generador=_GeneradorQueLanza()).consultar(solicitud_de(Q_HER2))

    assert respuesta.status_code == estado
    assert respuesta.json()["error"] == codigo


@pytest.mark.parametrize("valor", [None, {"status": "con_evidencia"}, "texto"])
def test_rag_query_responde_503_del_contrato_cuando_el_generador_devuelve_un_valor_que_no_es_la_respuesta(
    valor,
):
    entorno = crear_entorno(generador=_GeneradorQueDevuelve(valor))

    respuesta = entorno.consultar(solicitud_de(Q_HER2))

    assert respuesta.status_code == 503
    assert_matches_spec("#/paths/~1rag~1query/post/responses/503", respuesta.json())
    assert respuesta.json()["error"] == "LOCAL_LLM_UNAVAILABLE"
