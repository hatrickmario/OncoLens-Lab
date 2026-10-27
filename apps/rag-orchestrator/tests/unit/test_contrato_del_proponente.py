"""Contrato común de ``ApplicabilityTextProposer`` (LSP, Gate 2): el adapter real y el falso normalizan igual.

Ambos pasan por ``normalizar_propuesta``: valor sin espacios sobrantes, y sin propuesta cuando el valor queda vacío, supera
``LONGITUD_MAXIMA_DEL_VALOR`` o el ``chunkId`` viene vacío. Un fake más indulgente que el real escondería esos casos.
"""

import asyncio
import json
from collections.abc import Mapping
from typing import Any

import pytest

from app.application.ports import ApplicabilityTextProposer
from app.domain.applicability_text import (
    LONGITUD_MAXIMA_DEL_VALOR,
    ChunkDeFuente,
    CriterioPendiente,
    FuenteParaProponer,
    PropuestaDePoblacion,
    normalizar_propuesta,
)
from app.infrastructure.llm.proponente_de_aplicabilidad import LlmApplicabilityTextProposer
from tests.support.aplicabilidad import external_id_de
from tests.support.proponente_falso import ProponenteFalso

EXTERNAL_ID = external_id_de("doc-a2")
FUENTE = FuenteParaProponer(
    EXTERNAL_ID,
    (CriterioPendiente("estado_her2", "Estado de HER2", "HER2 status"),),
    (ChunkDeFuente("ch-a2-1", "HER2-negative disease."),),
)
# (valor, chunkId) tal como los entrega un LLM descuidado; solo la primera sobrevive, ya normalizada.
CRUDAS = (
    ("  HER2 negativo \n", "ch-a2-1"),
    ("   ", "ch-a2-1"),
    ("HER2 negativo", ""),
    ("x" * (LONGITUD_MAXIMA_DEL_VALOR + 1), "ch-a2-1"),
)
ESPERADO = (PropuestaDePoblacion(EXTERNAL_ID, "estado_her2", "HER2 negativo", "ch-a2-1"),)


class _LlmCrudo:
    async def completar_json(self, prompt: str, esquema: Mapping[str, Any]) -> str:
        return json.dumps(
            {
                "proposals": [
                    {"source": "S1", "criterion": "estado_her2", "value": v, "chunkId": c}
                    for v, c in CRUDAS
                ]
            }
        )


def _real() -> ApplicabilityTextProposer:
    return LlmApplicabilityTextProposer(_LlmCrudo())


def _falso() -> ApplicabilityTextProposer:
    return ProponenteFalso("APL-CRUDO")


@pytest.mark.parametrize("construir", [_real, _falso], ids=["real", "falso"])
def test_proponer_normaliza_y_descarta_igual_que_el_contrato_cuando_el_llm_entrega_valores_descuidados(
    construir,
):
    resultado = asyncio.run(construir().proponer([FUENTE]))

    assert resultado == ESPERADO


@pytest.mark.parametrize(
    ("valor", "chunk_id", "esperado"),
    [
        ("  HER2 negativo ", "ch-1", "HER2 negativo"),
        ("   ", "ch-1", None),
        ("HER2 negativo", "", None),
        ("HER2 negativo", "   ", None),
        ("x" * LONGITUD_MAXIMA_DEL_VALOR, "ch-1", "x" * LONGITUD_MAXIMA_DEL_VALOR),
        ("x" * (LONGITUD_MAXIMA_DEL_VALOR + 1), "ch-1", None),
    ],
)
def test_normalizar_propuesta_conserva_solo_valores_y_citas_utilizables(
    valor: str, chunk_id: str, esperado: str | None
):
    resultado = normalizar_propuesta("CDR-A2", "estado_her2", valor, chunk_id)

    assert (resultado.valor if resultado else None) == esperado
