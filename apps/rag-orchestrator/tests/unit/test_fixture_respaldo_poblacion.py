"""Humo de los fakes ``RESP-*`` de FX-08b-c (US-244, tarea 1.1) y de la clave ``POPULATION_FALLBACK_DEADLINE_MS`` (tarea 1.2).

Los fakes cumplen el contrato de ``LlmDePoblacion`` (LSP): salida con ``finish_reason``, y un LLM caído es ``FalloDelLlm``.
"""

import asyncio
import json

import pytest

from app.application.ports import FalloDelLlm
from app.config.settings import POBLACION_PLAZO_DEL_RESPALDO_MS_INICIAL, Settings
from tests.support.respaldo_poblacion import (
    ESCENARIOS_DE_RESPALDO,
    PROPUESTA_DE_RESP_OK,
    RespaldoLlmFalso,
)

PROMPT = "Criterio: estado_menopausico\n[ch-b9-1]\ntexto\n"


def _llamar(escenario: str, max_tokens: int = 64):
    llm = RespaldoLlmFalso(escenario)
    respuesta = asyncio.run(
        llm.completar_json_acotado(PROMPT, {}, max_tokens=max_tokens, semilla=0)
    )
    return llm, respuesta


def test_resp_ok_devuelve_la_propuesta_de_doc_b9_con_stop_cuando_se_llama():
    llm, respuesta = _llamar("RESP-OK")

    assert json.loads(respuesta.texto) == {"values": [PROPUESTA_DE_RESP_OK]}
    assert respuesta.finish_reason == "stop"
    (llamada,) = llm.llamadas
    assert (llamada.criterio, llamada.chunk_ids) == ("estado_menopausico", ("ch-b9-1",))


def test_resp_bucle_agota_los_tokens_y_termina_con_length_cuando_se_llama():
    _, respuesta = _llamar("RESP-BUCLE", max_tokens=64)

    assert respuesta.finish_reason == "length"
    assert respuesta.texto.count("postmenopausal women") > 1
    assert len(respuesta.texto) <= 64 * 4
    with pytest.raises(ValueError):
        json.loads(respuesta.texto)


def test_resp_truncado_devuelve_json_cortado_con_stop_cuando_se_llama():
    _, respuesta = _llamar("RESP-TRUNCADO")

    assert respuesta.finish_reason == "stop"
    with pytest.raises(ValueError):
        json.loads(respuesta.texto)


def test_resp_caido_lanza_fallo_del_llm_cuando_se_llama():
    with pytest.raises(FalloDelLlm):
        _llamar("RESP-CAIDO")


def test_resp_lento_no_responde_dentro_del_plazo_cuando_se_llama():
    async def con_plazo():
        llm = RespaldoLlmFalso("RESP-LENTO")
        async with asyncio.timeout(0.01):
            await llm.completar_json_acotado(PROMPT, {}, max_tokens=64, semilla=0)

    with pytest.raises(TimeoutError):
        asyncio.run(con_plazo())


def test_los_seis_escenarios_estan_declarados():
    assert len(ESCENARIOS_DE_RESPALDO) == 6


def test_plazo_del_respaldo_sale_de_la_configuracion_cuando_se_define_la_variable():
    por_defecto = Settings(_env_file=None, modelos=None)  # type: ignore[call-arg]
    definido = Settings(_env_file=None, modelos=None, population_fallback_deadline_ms=250)  # type: ignore[call-arg]

    assert por_defecto.population_fallback_deadline_ms == POBLACION_PLAZO_DEL_RESPALDO_MS_INICIAL
    assert definido.population_fallback_deadline_ms == 250


def test_plazo_del_respaldo_rechaza_cero_cuando_se_define_la_variable():
    with pytest.raises(ValueError):
        Settings(_env_file=None, modelos=None, population_fallback_deadline_ms=0)  # type: ignore[call-arg]
