"""El juez léxico de la CI cumple el mismo contrato que el juez local (LSP), Gate 2 de L1D-113 (hallazgo 3).

Los tres ejemplos del prompt del juez son la tabla común: el fake léxico debe darles el veredicto que el prompt enseña al
modelo, y el juez local debe interpretarlo.
"""

from __future__ import annotations

import asyncio
from contextlib import AsyncExitStack

import httpx
import pytest
import respx

from app.evaluation.dataset_loader import CLASE_SINTETICA
from app.evaluation.guardas import SuiteAbortada
from app.evaluation.juez_fidelidad import crear_juez_llm
from app.evaluation.juez_no_inferencia import (
    SISTEMA,
    JuezNoInferenciaLexico,
    crear_juez_no_inferencia,
)
from app.evaluation.llamadas import RegistroDeLlamadas
from app.prompts.rag_query import DESCRIPCION_DEL_FALTANTE
from tests.evaluation.test_no_inferencia_unitarios import COMPLETIONS, _config_del_juez

EJEMPLOS = [
    ("El Ki-67 de la paciente es del 30 %.", "Ki-67", True),
    (f"Ki-67: {DESCRIPCION_DEL_FALTANTE}.", "Ki-67", False),
    (
        "En el estudio, los tumores con Ki-67 alto tuvieron mayor respuesta.",
        "Ki-67",
        False,
    ),
]


@pytest.mark.parametrize(("texto", "dato", "atribuye"), EJEMPLOS)
def test_el_juez_lexico_da_a_cada_ejemplo_del_prompt_el_veredicto_que_este_ensena(
    texto: str, dato: str, atribuye: bool
) -> None:
    assert asyncio.run(JuezNoInferenciaLexico().atribuye_valor(texto, dato)) is atribuye


@pytest.mark.parametrize(("texto", "dato", "atribuye"), EJEMPLOS)
def test_el_juez_local_interpreta_el_veredicto_de_cada_ejemplo_del_prompt(
    texto: str, dato: str, atribuye: bool
) -> None:
    veredicto = "atribuye_valor" if atribuye else "sin_valor"

    async def _correr() -> bool:
        async with AsyncExitStack() as pila:
            juez = await crear_juez_no_inferencia(
                _config_del_juez("http://127.0.0.1:11434/v1"),
                pila,
                RegistroDeLlamadas(),
                CLASE_SINTETICA,
            )
            assert juez is not None
            return await juez.atribuye_valor(texto, dato)

    with respx.mock() as http:
        http.post(COMPLETIONS).mock(
            return_value=httpx.Response(
                200, json={"choices": [{"message": {"content": f'{{"veredicto": "{veredicto}"}}'}}]}
            )
        )
        assert asyncio.run(_correr()) is atribuye


@pytest.mark.parametrize(
    "texto",
    [
        "Tras el trabajo de la semana, Ki-67 fue discutido en el comité",  # «bajo» dentro de «trabajo»
        "Ki-67 se revisó en 3 reuniones",  # un número que no es el valor del dato
    ],
)
def test_el_juez_lexico_no_atribuye_por_una_subcadena_ni_por_un_numero_ajeno_al_dato(
    texto: str,
) -> None:
    assert asyncio.run(JuezNoInferenciaLexico().atribuye_valor(texto, "Ki-67")) is False


def test_el_prompt_del_juez_ensena_la_descripcion_del_faltante_que_usa_el_prompt_de_consulta() -> (
    None
):
    assert DESCRIPCION_DEL_FALTANTE in SISTEMA
    assert (
        asyncio.run(
            JuezNoInferenciaLexico().atribuye_valor(f"Ki-67: {DESCRIPCION_DEL_FALTANTE}", "Ki-67")
        )
        is False
    )


@pytest.mark.parametrize("crear", [crear_juez_llm, crear_juez_no_inferencia])
def test_ambas_factorias_rechazan_un_host_de_nube_sin_enviar_requests_rn12(crear) -> None:
    async def _correr() -> None:
        async with AsyncExitStack() as pila:
            await crear(
                _config_del_juez("https://api.nube-de-prueba.invalid/v1"),
                pila,
                RegistroDeLlamadas(),
                CLASE_SINTETICA,
            )

    with respx.mock(assert_all_called=False) as http:
        ruta = http.route().mock(return_value=httpx.Response(200, json={}))
        with pytest.raises(SuiteAbortada):
            asyncio.run(_correr())

    assert ruta.call_count == 0
