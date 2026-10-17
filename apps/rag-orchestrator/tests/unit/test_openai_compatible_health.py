import logging

import httpx
import pytest
import respx

from app.config.logging import silenciar_urls_de_httpx_en_logs
from app.infrastructure.llm.openai_compatible_health import OpenAICompatibleLlmHealth

pytestmark = pytest.mark.anyio

BASE = "http://llm-nativo.test:11434/v1"


async def test_esta_disponible_consulta_models_y_devuelve_true_cuando_responde_200():
    with respx.mock(assert_all_called=False) as llm:
        sonda = llm.get(f"{BASE}/models").mock(return_value=httpx.Response(200, json={"data": []}))

        assert await OpenAICompatibleLlmHealth(BASE, 2000).esta_disponible() is True

    assert sonda.call_count == 1


async def test_esta_disponible_ignora_la_barra_final_de_la_url_base():
    with respx.mock(assert_all_called=False) as llm:
        sonda = llm.get(f"{BASE}/models").mock(return_value=httpx.Response(200))

        assert await OpenAICompatibleLlmHealth(BASE + "/", 2000).esta_disponible() is True

    assert sonda.call_count == 1


@pytest.mark.parametrize("estado", [500, 502, 503])
async def test_esta_disponible_devuelve_false_cuando_el_llm_responde_5xx(estado):
    with respx.mock(assert_all_called=False) as llm:
        llm.get(f"{BASE}/models").mock(return_value=httpx.Response(estado))

        assert await OpenAICompatibleLlmHealth(BASE, 2000).esta_disponible() is False


@pytest.mark.parametrize(
    "error", [httpx.ConnectError("x"), httpx.ReadTimeout("x"), httpx.ConnectTimeout("x")]
)
async def test_esta_disponible_devuelve_false_cuando_no_hay_conexion_o_vence_el_timeout(error):
    with respx.mock(assert_all_called=False) as llm:
        llm.get(f"{BASE}/models").mock(side_effect=error)

        assert await OpenAICompatibleLlmHealth(BASE, 2000).esta_disponible() is False


async def test_logs_no_registran_la_url_del_llm_cuando_el_logging_esta_configurado(caplog):
    silenciar_urls_de_httpx_en_logs()
    caplog.set_level(logging.INFO)
    with respx.mock(assert_all_called=False) as llm:
        llm.get(f"{BASE}/models").mock(return_value=httpx.Response(200))
        await OpenAICompatibleLlmHealth(BASE, 2000).esta_disponible()

    assert "llm-nativo" not in caplog.text
