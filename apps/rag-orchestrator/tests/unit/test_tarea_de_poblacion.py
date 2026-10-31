"""Adapter ``TareaDePoblacionLocal`` (US-244, ADR-47 etapa C): prompt, tope de tokens, alcance y traducción de fallos.

El LLM es el borde falso ``RespaldoLlmFalso`` (mismo puerto ``LlmDePoblacion`` que la ingesta). Las medidas del fallo
(``finish_reason`` y longitud) nunca llevan la salida del LLM (RN-14).
"""

import asyncio

import pytest

from app.application.corpus_metadata.poblacion_puertos import RespuestaDelLlm
from app.domain.applicability_text import (
    CausaDeRespaldo,
    ChunkDeFuente,
    CriterioPendiente,
    FuenteParaProponer,
    PropuestaDePoblacion,
    RespaldoFallido,
)
from tests.support.respaldo_poblacion import RespaldoLlmFalso, tarea_de_respaldo

MENOPAUSIA = CriterioPendiente("estado_menopausico", "Estado menopáusico", "Menopausal status")
FUENTE = FuenteParaProponer(
    "CDR-TEST-B9",
    (MENOPAUSIA,),
    (ChunkDeFuente("ch-b9-1", "Eligible patients were postmenopausal women."),),
)


def _proponer(llm, fuente: FuenteParaProponer = FUENTE, **config):
    return asyncio.run(tarea_de_respaldo(llm, **config).proponer(fuente))


def test_proponer_devuelve_el_valor_con_su_cita_cuando_el_llm_responde_con_stop():
    llm = RespaldoLlmFalso("RESP-OK")

    resultado = _proponer(llm)

    assert resultado == (
        PropuestaDePoblacion(
            "CDR-TEST-B9", "estado_menopausico", "postmenopausal women", "ch-b9-1"
        ),
    )
    (llamada,) = llm.llamadas
    assert (llamada.criterio, llamada.chunk_ids, llamada.semilla) == (
        "estado_menopausico",
        ("ch-b9-1",),
        0,
    )


def test_proponer_pide_al_llm_el_tope_de_tokens_de_la_configuracion_cuando_se_llama():
    llm = RespaldoLlmFalso("RESP-OK")

    _proponer(llm, max_tokens=77)

    assert llm.llamadas[0].max_tokens == 77


def test_proponer_devuelve_vacio_cuando_el_llm_no_encuentra_nada():
    assert _proponer(RespaldoLlmFalso("RESP-SILENCIO")) == ()


def test_proponer_conserva_solo_los_valores_de_elegibilidad_cuando_el_llm_marca_subgrupo_o_mencion():
    class Llm:
        async def completar_json_acotado(self, prompt, esquema, *, max_tokens, semilla):
            return RespuestaDelLlm(
                '{"values": [{"value": "triple-negative", "chunkId": "ch-b9-1", "scope": "subgrupo"},'
                ' {"value": "older adults", "chunkId": "ch-b9-1", "scope": "mencion"}]}',
                "stop",
            )

    assert _proponer(Llm()) == ()


@pytest.mark.parametrize(
    ("escenario", "causa", "finish_reason"),
    [
        ("RESP-BUCLE", CausaDeRespaldo.bucle, "length"),
        ("RESP-TRUNCADO", CausaDeRespaldo.truncado, "stop"),
        ("RESP-CAIDO", CausaDeRespaldo.caido, None),
    ],
)
def test_proponer_lanza_respaldo_fallido_con_la_causa_cuando_el_llm_falla(
    escenario, causa, finish_reason
):
    with pytest.raises(RespaldoFallido) as excepcion:
        _proponer(RespaldoLlmFalso(escenario))

    assert (excepcion.value.causa, excepcion.value.finish_reason) == (causa, finish_reason)


def test_proponer_mide_la_longitud_de_la_salida_sin_copiarla_cuando_el_llm_entra_en_bucle():
    with pytest.raises(RespaldoFallido) as excepcion:
        _proponer(RespaldoLlmFalso("RESP-BUCLE"), max_tokens=64)

    assert excepcion.value.longitud == 64 * 4
    assert "postmenopausal" not in str(excepcion.value)


def test_proponer_rechaza_mas_de_un_criterio_por_llamada():
    dos = FuenteParaProponer("CDR-TEST-B9", (MENOPAUSIA, MENOPAUSIA), FUENTE.chunks)

    with pytest.raises(ValueError):
        _proponer(RespaldoLlmFalso("RESP-OK"), dos)


def test_proponer_recorta_los_fragmentos_al_presupuesto_y_conserva_el_primero():
    chunks = (
        ChunkDeFuente("ch-b9-1", "a" * 40),
        ChunkDeFuente("ch-b9-2", "b" * 40),
    )
    llm = RespaldoLlmFalso("RESP-SILENCIO")

    _proponer(
        llm, FuenteParaProponer("CDR-TEST-B9", (MENOPAUSIA,), chunks), max_chars_fragmentos=60
    )

    assert llm.llamadas[0].chunk_ids == ("ch-b9-1",)
