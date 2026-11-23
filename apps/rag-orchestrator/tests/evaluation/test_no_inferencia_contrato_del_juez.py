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
from app.evaluation.juez_no_inferencia import JuezNoInferenciaLexico, crear_juez_no_inferencia
from app.evaluation.llamadas import RegistroDeLlamadas
from tests.evaluation.test_no_inferencia_unitarios import COMPLETIONS, _config_del_juez

EJEMPLOS = [
    ("El Ki-67 de la paciente es del 30 %.", "Ki-67", True),
    ("Ki-67: sin dato registrado (desconocido).", "Ki-67", False),
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
