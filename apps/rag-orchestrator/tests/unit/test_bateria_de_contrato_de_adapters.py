"""Batería de contrato del puerto ``LlmClient``: el fake cumple lo que el adaptador real (US-057, D3)."""

import pytest

from tests.support.llm_falso import FakeLlmClient

pytestmark = pytest.mark.anyio


async def test_el_fake_registra_el_mensaje_de_sistema_y_el_de_usuario_cuando_recibe_el_sistema():
    llm = FakeLlmClient()

    await llm.completar_json("datos delimitados", {}, sistema="instrucciones")

    assert llm.sistemas == ["instrucciones"]
    assert llm.prompts == ["datos delimitados"]


async def test_el_fake_registra_sistema_none_cuando_se_invoca_sin_sistema():
    llm = FakeLlmClient()

    await llm.completar_json("solo usuario", {})

    assert llm.sistemas == [None]
