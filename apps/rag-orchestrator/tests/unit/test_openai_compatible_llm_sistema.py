"""El cliente del LLM envía instrucciones como mensaje ``system`` y datos como ``user`` (US-057, SEG-13)."""

import json

import httpx
import pytest
import respx

from app.infrastructure.llm.openai_compatible import OpenAICompatibleLlmClient

pytestmark = pytest.mark.anyio

BASE = "http://llm-nativo.test:11434/v1"
URL = f"{BASE}/chat/completions"
ESQUEMA = {"type": "object"}


def _cliente() -> OpenAICompatibleLlmClient:
    return OpenAICompatibleLlmClient(BASE, "llm-test@1", 2000, 512)


async def test_completar_json_envia_un_mensaje_system_y_uno_user_cuando_se_pasa_el_sistema():
    with respx.mock(assert_all_called=False) as llm:
        ruta = llm.post(URL).mock(
            return_value=httpx.Response(
                200, json={"choices": [{"message": {"content": '{"a":1}'}}]}
            )
        )

        await _cliente().completar_json("datos", ESQUEMA, sistema="instrucciones")

    mensajes = json.loads(ruta.calls[0].request.content)["messages"]
    assert mensajes == [
        {"role": "system", "content": "instrucciones"},
        {"role": "user", "content": "datos"},
    ]


async def test_completar_json_envia_solo_el_mensaje_user_cuando_no_se_pasa_el_sistema():
    with respx.mock(assert_all_called=False) as llm:
        ruta = llm.post(URL).mock(
            return_value=httpx.Response(
                200, json={"choices": [{"message": {"content": '{"a":1}'}}]}
            )
        )

        await _cliente().completar_json("datos", ESQUEMA)

    mensajes = json.loads(ruta.calls[0].request.content)["messages"]
    assert mensajes == [{"role": "user", "content": "datos"}]


async def test_completar_json_acotado_envia_el_mensaje_system_cuando_se_pasa_el_sistema():
    with respx.mock(assert_all_called=False) as llm:
        ruta = llm.post(URL).mock(
            return_value=httpx.Response(
                200, json={"choices": [{"message": {"content": "{}"}, "finish_reason": "stop"}]}
            )
        )

        await _cliente().completar_json_acotado(
            "datos", ESQUEMA, max_tokens=8, semilla=0, sistema="instrucciones"
        )

    mensajes = json.loads(ruta.calls[0].request.content)["messages"]
    assert [m["role"] for m in mensajes] == ["system", "user"]
