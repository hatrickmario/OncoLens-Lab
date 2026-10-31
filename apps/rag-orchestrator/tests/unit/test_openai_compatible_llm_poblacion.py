"""Cliente del LLM local en la tarea corta de población (US-242 D5): tope de tokens, semilla y ``finish_reason`` (RN-12)."""

import json

import httpx
import pytest
import respx

from app.application.ports import FalloDelLlm
from app.infrastructure.llm.openai_compatible import MOTIVO_DESCONOCIDO, OpenAICompatibleLlmClient

pytestmark = pytest.mark.anyio

BASE = "http://llm-nativo.test:11434/v1"
URL = f"{BASE}/chat/completions"
ESQUEMA = {"type": "object"}


def _cliente() -> OpenAICompatibleLlmClient:
    return OpenAICompatibleLlmClient(BASE, "llm-test@1", 2000, 2048)


async def test_completar_json_acotado_envia_el_tope_y_la_semilla_de_la_tarea_y_devuelve_el_finish_reason():
    with respx.mock(assert_all_called=False) as llm:
        ruta = llm.post(URL).mock(
            return_value=httpx.Response(
                200,
                json={
                    "choices": [{"message": {"content": '{"values":[]}'}, "finish_reason": "stop"}]
                },
            )
        )

        respuesta = await _cliente().completar_json_acotado(
            "prompt", ESQUEMA, max_tokens=512, semilla=3
        )

    assert (respuesta.texto, respuesta.finish_reason) == ('{"values":[]}', "stop")
    cuerpo = json.loads(ruta.calls[0].request.content)
    assert (cuerpo["max_tokens"], cuerpo["seed"], cuerpo["temperature"]) == (512, 3, 0)
    assert cuerpo["response_format"]["json_schema"]["schema"] == ESQUEMA


async def test_completar_json_acotado_devuelve_length_cuando_el_llm_corta_la_salida():
    with respx.mock(assert_all_called=False) as llm:
        llm.post(URL).mock(
            return_value=httpx.Response(
                200,
                json={"choices": [{"message": {"content": '{"val'}, "finish_reason": "length"}]},
            )
        )

        respuesta = await _cliente().completar_json_acotado(
            "prompt", ESQUEMA, max_tokens=8, semilla=0
        )

    assert respuesta.finish_reason == "length"


async def test_completar_json_acotado_marca_desconocido_cuando_el_llm_no_informa_el_motivo():
    with respx.mock(assert_all_called=False) as llm:
        llm.post(URL).mock(
            return_value=httpx.Response(200, json={"choices": [{"message": {"content": "{}"}}]})
        )

        respuesta = await _cliente().completar_json_acotado(
            "prompt", ESQUEMA, max_tokens=8, semilla=0
        )

    assert respuesta.finish_reason == MOTIVO_DESCONOCIDO


@pytest.mark.parametrize("estado", [400, 503])
async def test_completar_json_acotado_lanza_fallo_del_llm_sin_detalle_cuando_el_llm_responde_error(
    estado,
):
    with respx.mock(assert_all_called=False) as llm:
        llm.post(URL).mock(return_value=httpx.Response(estado, text="SENTINELA-DETALLE"))

        with pytest.raises(FalloDelLlm) as error:
            await _cliente().completar_json_acotado("prompt", ESQUEMA, max_tokens=8, semilla=0)

    assert "SENTINELA-DETALLE" not in str(error.value)


async def test_completar_json_no_envia_semilla_y_conserva_su_contrato():
    with respx.mock(assert_all_called=False) as llm:
        ruta = llm.post(URL).mock(
            return_value=httpx.Response(200, json={"choices": [{"message": {"content": "{}"}}]})
        )

        crudo = await _cliente().completar_json("prompt", ESQUEMA)

    assert crudo == "{}"
    assert "seed" not in json.loads(ruta.calls[0].request.content)
