"""Batería de contrato del puerto ``LlmClient``: el fake cumple lo que el adaptador real (US-057, D3)."""

import inspect

import pytest

from app.evaluation.adaptadores_poblacion import LlmGuionadoDePoblacion
from app.infrastructure.llm.openai_compatible import OpenAICompatibleLlmClient
from tests.integration.test_rag_query_aplicabilidad_textual_bordes import _LlmHer2
from tests.support.llm_falso import FakeLlmClient
from tests.support.metadatos import FakeMetadataLlm
from tests.support.poblacion_abanico import FakePopulationLlm
from tests.support.respaldo_poblacion import RespaldoLlmFalso

pytestmark = pytest.mark.anyio


async def test_el_fake_registra_el_mensaje_de_sistema_y_el_de_usuario_cuando_recibe_el_sistema():
    llm = FakeLlmClient()

    await llm.completar_json("datos delimitados", {}, sistema="instrucciones")

    assert llm.sistemas == ["instrucciones"]
    assert llm.usuarios == ["datos delimitados"]


async def test_el_fake_registra_sistema_none_cuando_se_invoca_sin_sistema():
    llm = FakeLlmClient()

    await llm.completar_json("solo usuario", {})

    assert llm.sistemas == [None]


@pytest.mark.parametrize(
    ("clase", "metodo"),
    [
        (OpenAICompatibleLlmClient, "completar_json"),
        (OpenAICompatibleLlmClient, "completar_json_acotado"),
        (FakeLlmClient, "completar_json"),
        (FakeMetadataLlm, "completar_json"),
        (RespaldoLlmFalso, "completar_json_acotado"),
        (FakePopulationLlm, "completar_json_acotado"),
        (LlmGuionadoDePoblacion, "completar_json_acotado"),
        (_LlmHer2, "completar_json_acotado"),
    ],
)
def test_el_adaptador_y_sus_fakes_comparten_la_firma_del_puerto_con_usuario_y_sistema_opcional(
    clase, metodo
):
    parametros = inspect.signature(getattr(clase, metodo)).parameters

    assert list(parametros)[1] == "usuario"
    assert parametros["sistema"].kind is inspect.Parameter.KEYWORD_ONLY
    assert parametros["sistema"].default is None
