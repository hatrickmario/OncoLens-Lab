"""Humo de los fakes de FX-06c-b ampliada (US-118, tarea 1.1): cumplen el contrato de los puertos reales."""

from __future__ import annotations

import asyncio
import json

import pytest

from app.application.ports import FalloDelLlm
from app.infrastructure.fetch.fuente_de_texto import FuenteDeTextoDelManifiesto
from tests.support.metadatos import (
    MARCADOR_I_LIT_1,
    MARCADOR_I_LIT_2,
    PROPUESTA_I_LIT_1,
    FakeMetadataLlm,
    lote_sintetico,
    marcador_del_lote,
)
from tests.support.semilla import DIRECTORIO_DE_FIXTURES


def _completar(llm: FakeMetadataLlm, prompt: str) -> str:
    return asyncio.run(llm.completar_json(prompt, {}))


def test_el_llm_falso_propone_los_metadatos_de_i_lit_1_y_nada_para_el_resto() -> None:
    llm = FakeMetadataLlm()

    assert json.loads(_completar(llm, f"texto: {MARCADOR_I_LIT_1}")) == PROPUESTA_I_LIT_1
    assert json.loads(_completar(llm, f"texto: {MARCADOR_I_LIT_2}")) == {}


def test_el_llm_falso_registra_las_invocaciones_por_documento() -> None:
    llm = FakeMetadataLlm()

    _completar(llm, f"texto: {MARCADOR_I_LIT_1}")
    _completar(llm, f"texto: {MARCADOR_I_LIT_1}")

    assert (llm.invocaciones, llm.invocaciones_de(MARCADOR_I_LIT_1)) == (2, 2)
    assert llm.invocaciones_de(MARCADOR_I_LIT_2) == 0


def test_el_llm_falso_en_modo_error_lanza_el_error_del_puerto_sin_texto() -> None:
    with pytest.raises(FalloDelLlm) as error:
        _completar(FakeMetadataLlm(modo="error"), f"texto: {MARCADOR_I_LIT_1}")

    assert MARCADOR_I_LIT_1 not in str(error.value)


def test_el_llm_falso_en_modo_json_invalido_devuelve_un_texto_que_no_es_json() -> None:
    with pytest.raises(json.JSONDecodeError):
        json.loads(_completar(FakeMetadataLlm(modo="json_invalido"), "x"))


def test_el_lote_sintetico_trae_20_documentos_con_texto_propio_y_sin_criterios_estructurados() -> (
    None
):
    lote = lote_sintetico()
    fuente = FuenteDeTextoDelManifiesto(DIRECTORIO_DE_FIXTURES, None)

    assert len(lote) == 20 and len({d.document_key for d in lote}) == 20
    assert all(d.population_criteria is None for d in lote)
    assert marcador_del_lote(7) in fuente.obtener_texto(lote[6])
