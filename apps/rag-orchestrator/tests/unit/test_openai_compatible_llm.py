"""Cliente del LLM local OpenAI-compatible (L1D-275, tarea 2.9): RN-12, sin reintento, sin detalle en el error."""

import json

import httpx
import pytest
import respx

from app.application.ports import FalloDelLlm
from app.infrastructure.llm.openai_compatible import OpenAICompatibleLlmClient

pytestmark = pytest.mark.anyio

BASE = "http://llm-nativo.test:11434/v1"
URL = f"{BASE}/chat/completions"
ESQUEMA = {"type": "object"}


def _cliente() -> OpenAICompatibleLlmClient:
    return OpenAICompatibleLlmClient(BASE, "llm-test@1", 2000, 512)


async def test_completar_json_devuelve_el_contenido_del_primer_mensaje_cuando_el_llm_responde_200():
    with respx.mock(assert_all_called=False) as llm:
        ruta = llm.post(URL).mock(
            return_value=httpx.Response(
                200, json={"choices": [{"message": {"content": '{"a":1}'}}]}
            )
        )

        crudo = await _cliente().completar_json("prompt", ESQUEMA)

    assert crudo == '{"a":1}'
    cuerpo = json.loads(ruta.calls[0].request.content)
    assert cuerpo["model"] == "llm-test@1"
    assert cuerpo["temperature"] == 0
    assert cuerpo["max_tokens"] == 512
    assert cuerpo["stream"] is False
    assert cuerpo["response_format"]["json_schema"]["schema"] == ESQUEMA


@pytest.mark.parametrize("estado", [400, 500, 503])
async def test_completar_json_lanza_fallo_del_llm_sin_reintento_cuando_el_llm_responde_error(
    estado,
):
    with respx.mock(assert_all_called=False) as llm:
        ruta = llm.post(URL).mock(return_value=httpx.Response(estado, text="SENTINELA-DETALLE"))

        with pytest.raises(FalloDelLlm) as error:
            await _cliente().completar_json("prompt", ESQUEMA)

    assert ruta.call_count == 1
    assert "SENTINELA-DETALLE" not in str(error.value)


@pytest.mark.parametrize(
    "efecto",
    [httpx.ConnectError("no hay ruta"), httpx.ReadTimeout("plazo agotado")],
)
async def test_completar_json_lanza_fallo_del_llm_cuando_no_hay_conexion_o_se_agota_el_plazo(
    efecto,
):
    with respx.mock(assert_all_called=False) as llm:
        llm.post(URL).mock(side_effect=efecto)

        with pytest.raises(FalloDelLlm):
            await _cliente().completar_json("prompt", ESQUEMA)


@pytest.mark.parametrize(
    "cuerpo",
    [{}, {"choices": []}, {"choices": [{"message": {"content": None}}]}, {"choices": [{}]}],
)
async def test_completar_json_lanza_fallo_del_llm_cuando_el_cuerpo_no_trae_contenido(cuerpo):
    with respx.mock(assert_all_called=False) as llm:
        llm.post(URL).mock(return_value=httpx.Response(200, json=cuerpo))

        with pytest.raises(FalloDelLlm):
            await _cliente().completar_json("prompt", ESQUEMA)


async def test_completar_json_lanza_fallo_del_llm_cuando_el_cuerpo_no_es_json():
    with respx.mock(assert_all_called=False) as llm:
        llm.post(URL).mock(return_value=httpx.Response(200, text="<html>"))

        with pytest.raises(FalloDelLlm):
            await _cliente().completar_json("prompt", ESQUEMA)
