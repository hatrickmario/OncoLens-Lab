"""El LLM falso del chat cumple el contrato del puerto con los escenarios ``CHAT-CASO-*`` (US-260, LSP).

Texto CRUDO conforme al esquema de generación (``claims`` con ``text``, ``factRefs`` y ``citations``) o ``FalloDelLlm`` como
el adapter real; las salidas previas al filtro (``INVENTA``, ``SIN-ENLACE``) también son JSON válido: el filtro es del nodo.
"""

import json

import pytest

from app.application.chat.grafo import ESQUEMA_DEL_TURNO, propuestas_de_la_salida
from app.application.ports import FalloDelLlm
from tests.support.llm_chat_falso import ESCENARIOS, FakeChatLlm

pytestmark = pytest.mark.anyio

ESCENARIOS_DE_CASO = sorted(
    n for n in ESCENARIOS if n.startswith(("CHAT-CASO-", "CHAT-CONFLICTO-"))
)


def test_los_escenarios_de_caso_incluyen_los_tres_de_la_historia():
    assert {"CHAT-CASO-OK", "CHAT-CASO-INVENTA", "CHAT-CASO-SIN-ENLACE"} <= set(ESCENARIOS_DE_CASO)


def test_los_escenarios_de_caso_incluyen_los_de_conflicto_de_la_historia_us_262():
    assert {"CHAT-CONFLICTO-RESUELVE", "CHAT-CONFLICTO-AMBOS"} <= set(ESCENARIOS_DE_CASO)


@pytest.mark.parametrize("escenario", ESCENARIOS_DE_CASO)
async def test_el_fake_devuelve_texto_crudo_que_cumple_el_esquema_de_generacion_cuando_es_un_escenario_de_caso(
    escenario,
):
    llm = FakeChatLlm(escenario)

    crudo = await llm.completar_json("u", ESQUEMA_DEL_TURNO, sistema="s")

    assert isinstance(crudo, str)
    assert json.loads(crudo)["claims"]
    assert propuestas_de_la_salida(crudo, "req_t")


async def test_el_fake_falla_con_el_error_del_puerto_cuando_el_llm_local_esta_caido():
    llm = FakeChatLlm("CHAT-CASO-OK", error=FalloDelLlm())

    with pytest.raises(FalloDelLlm):
        await llm.completar_json("u", ESQUEMA_DEL_TURNO, sistema="s")
