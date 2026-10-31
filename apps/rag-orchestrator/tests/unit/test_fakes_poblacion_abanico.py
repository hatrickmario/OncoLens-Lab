"""Humo de los fakes de FX-06c-c: cumplen el contrato de los puertos reales (LSP), con sus mismos errores."""

from __future__ import annotations

import json

import pytest

from app.application.corpus_metadata.poblacion_puertos import DocumentoParaExtraer
from app.application.ports import FalloDelLlm
from app.domain.nli import ParNli
from tests.support.poblacion_abanico import (
    FRAGMENTOS_POR_DOCUMENTO,
    FakePopulationLlm,
    NliPorValor,
    RecuperadorFalsoPorDocumento,
    criterios_de_mama,
    documentos_e,
)

pytestmark = pytest.mark.anyio
PROMPT = "Criterio: estado_menopausico\n[ch-e1-1]\ntexto\n"


async def test_el_llm_falso_devuelve_json_crudo_y_un_finish_reason_como_el_adapter_real() -> None:
    llm = FakePopulationLlm(("EXT-OK",))

    respuesta = await llm.completar_json_acotado(PROMPT, {}, max_tokens=512, semilla=0)

    assert respuesta.finish_reason == "stop"
    valores = json.loads(respuesta.texto)["values"]
    assert [v["value"] for v in valores] == ["premenopausal women", "postmenopausal women"]
    assert llm.llamadas[0].chunk_ids == ("ch-e1-1",)


async def test_el_llm_falso_cortado_devuelve_length_con_json_truncado_solo_las_veces_pedidas() -> (
    None
):
    llm = FakePopulationLlm(cortes={"estado_menopausico": 1})

    primera = await llm.completar_json_acotado(PROMPT, {}, max_tokens=512, semilla=0)
    segunda = await llm.completar_json_acotado(PROMPT, {}, max_tokens=512, semilla=1)

    assert primera.finish_reason == "length"
    with pytest.raises(ValueError, match="Unterminated|Expecting"):
        json.loads(primera.texto)
    assert segunda.finish_reason == "stop"


async def test_el_llm_falso_caido_lanza_fallo_del_llm_como_el_adapter_real() -> None:
    llm = FakePopulationLlm(modo_caido=True)

    with pytest.raises(FalloDelLlm):
        await llm.completar_json_acotado(PROMPT, {}, max_tokens=512, semilla=0)

    assert llm.invocaciones == 1


def test_el_recuperador_falso_nunca_devuelve_fragmentos_de_otro_documento_y_respeta_k() -> None:
    recuperador = RecuperadorFalsoPorDocumento()
    criterio = criterios_de_mama()[0]
    for clave, documento in documentos_e().items():
        para_extraer = DocumentoParaExtraer(clave, f"{clave}@x", ())
        ids = {f.chunk_id for f in FRAGMENTOS_POR_DOCUMENTO[documento.document_key]}

        relevantes = recuperador.relevantes(para_extraer, criterio, 2)

        assert len(relevantes) <= 2
        assert {f.chunk_id for f in relevantes} <= ids
        assert {f.chunk_id for f in recuperador.todos(para_extraer)} == ids


def test_el_nli_falso_devuelve_un_resultado_por_par_y_la_lista_vacia_para_ningun_par() -> None:
    nli = NliPorValor()

    resultados = nli.clasificar(
        [ParNli("premisa", "stage I–III"), ParNli("premisa", "HER2-positive")]
    )

    assert [r.label for r in resultados] == ["neutral", "entailment"]
    assert nli.clasificar([]) == []
