"""El LLM falso del chat cumple el contrato del puerto con los escenarios ``CHAT-RELEVANCIA-*`` (US-264, LSP).

Texto CRUDO conforme al esquema de generación del seguimiento citado (``claims`` con ``text`` y ``citations``) o
``FalloDelLlm`` como el adapter real; la salida inválida es texto que no parsea, como la de un modelo real. El NLI falso
pasa su propia batería de contrato en ``test_bateria_de_contrato_nli``.
"""

import json

import pytest

from app.application.chat.capacidades.afirmaciones_citadas import SalidaCruda, esquema_de_la_salida
from app.application.ports import FalloDelLlm
from pydantic import ValidationError
from tests.support.llm_chat_falso import ESCENARIOS, FakeChatLlm

pytestmark = pytest.mark.anyio

ESCENARIOS_DE_RELEVANCIA = sorted(n for n in ESCENARIOS if n.startswith("CHAT-RELEVANCIA-"))
VALIDOS = [n for n in ESCENARIOS_DE_RELEVANCIA if n != "CHAT-RELEVANCIA-SALIDA-INVALIDA"]


def test_los_escenarios_de_relevancia_incluyen_los_de_la_historia():
    assert {
        "CHAT-RELEVANCIA-OK",
        "CHAT-RELEVANCIA-KI67",
        "CHAT-RELEVANCIA-PRESCRIPTIVO",
        "CHAT-RELEVANCIA-TURNO-ANTERIOR",
        "CHAT-RELEVANCIA-SALIDA-INVALIDA",
    } <= set(ESCENARIOS_DE_RELEVANCIA)


@pytest.mark.parametrize("escenario", VALIDOS)
async def test_el_fake_devuelve_texto_crudo_que_cumple_el_esquema_cuando_el_escenario_es_valido(
    escenario,
):
    llm = FakeChatLlm(escenario)

    crudo = await llm.completar_json("u", esquema_de_la_salida(3), sistema="s")

    assert isinstance(crudo, str)
    assert json.loads(crudo)["claims"]
    assert SalidaCruda.model_validate_json(crudo).afirmaciones


async def test_el_fake_devuelve_texto_que_no_parsea_cuando_el_escenario_es_de_salida_invalida():
    llm = FakeChatLlm("CHAT-RELEVANCIA-SALIDA-INVALIDA")

    crudo = await llm.completar_json("u", esquema_de_la_salida(3), sistema="s")

    with pytest.raises(ValidationError):
        SalidaCruda.model_validate_json(crudo)


async def test_el_fake_falla_con_el_error_del_puerto_cuando_el_llm_local_esta_caido():
    llm = FakeChatLlm("CHAT-RELEVANCIA-OK", error=FalloDelLlm())

    with pytest.raises(FalloDelLlm):
        await llm.completar_json("u", esquema_de_la_salida(3), sistema="s")
