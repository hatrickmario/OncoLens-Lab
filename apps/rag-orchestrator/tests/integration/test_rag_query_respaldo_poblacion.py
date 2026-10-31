"""`POST /rag/query`, respaldo de la población en la consulta (US-244 / L1D-294): ADR-47 etapa C, RN-01, RN-26, RN-14.

FX-08b-c: paciente A-M2, corpus ``doc-b1``…``doc-b10`` (``doc-b9`` con ``estado_menopausico`` ``pendiente``), catálogo
``test-apl-1.2.0`` y el LLM de opciones ``LLM-POB``; el LLM del respaldo (``RESP-*``), el NLI, el reranker y Milvus son
falsos. El adapter real de la tarea corta construye el prompt. Cada respuesta la valida contra el spec del proveedor el
hook de ``verificacion_proveedor.py`` (US-214).
"""

from dataclasses import replace
from typing import Any

import pytest

from tests.support.nli_falso import IMPLICA, NliFalso
from tests.support.poblacion_fx08bc import (
    FICHAS_FX08BC,
    TEXTO_DE_CH_B9_1,
    entorno_fx08bc,
    solicitud_a_m2,
)
from tests.support.recuperacion import PARAMETROS_DE_PRUEBA, PARAMETROS_DEL_RESPALDO_DE_PRUEBA
from tests.support.respaldo_poblacion import (
    RespaldoLlmFalso,
    tarea_de_respaldo,
)


def _consultar(
    escenario: str,
    *opciones: str,
    nli: NliFalso | None = None,
    plazo_ms: int | None = None,
) -> tuple[dict[str, Any], RespaldoLlmFalso]:
    llm = RespaldoLlmFalso(escenario)
    parametros = PARAMETROS_DE_PRUEBA
    if plazo_ms is not None:
        respaldo = replace(PARAMETROS_DEL_RESPALDO_DE_PRUEBA, plazo_ms=plazo_ms)
        parametros = replace(PARAMETROS_DE_PRUEBA, respaldo=respaldo)
    entorno = entorno_fx08bc(
        *opciones,
        proponente=tarea_de_respaldo(llm),
        clasificador_nli=nli or NliFalso(por_defecto=IMPLICA),
        parametros=parametros,
    )
    respuesta = entorno.consultar(solicitud_a_m2())
    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert cuerpo["status"] == "con_evidencia"
    return cuerpo, llm


def _criterio(cuerpo: dict[str, Any], documento: str, criterio: str) -> dict[str, Any]:
    externo = FICHAS_FX08BC[documento].external_id
    (fuente,) = [f for f in cuerpo["applicability"] if f["externalId"] == externo]
    return {c["criterion"]: c for c in fuente["criteria"]}[criterio]


@pytest.mark.ac("US-244", 1)
def test_respaldo_completa_criterio_pendiente_con_solo_fragmentos_de_doc_b9():
    nli = NliFalso(por_defecto=IMPLICA)
    solicitud = solicitud_a_m2()

    cuerpo, llm = _consultar("RESP-OK", "O-P9", nli=nli)

    assert llm.invocaciones == 1
    (llamada,) = llm.llamadas
    assert (llamada.criterio, llamada.chunk_ids) == ("estado_menopausico", ("ch-b9-1",))
    for ajeno in (
        solicitud["clinicalContext"]["pseudoPatientId"],
        solicitud["query"],
        "posmenopáusica",  # valor del paciente
        "3+ (IHQ)",
    ):
        assert ajeno not in llamada.prompt
    menopausia = _criterio(cuerpo, "doc-b9", "estado_menopausico")
    assert (menopausia["status"], menopausia["unknownReason"]) == ("coincide", None)
    assert [c["chunkId"] for c in menopausia["citedSources"]] == ["ch-b9-1"]
    assert any(par.premisa == TEXTO_DE_CH_B9_1 for par in nli.pares_recibidos)


def _sin_respaldo() -> dict[str, Any]:
    """El mismo análisis de A-M2 × O-P9 cuando el LLM del respaldo no encuentra nada: la referencia de AC-2, AC-3 y AC-7."""
    cuerpo, _ = _consultar("RESP-SILENCIO", "O-P9")
    return cuerpo


def _exigir_respaldo_fallido(cuerpo: dict[str, Any]) -> None:
    menopausia = _criterio(cuerpo, "doc-b9", "estado_menopausico")
    assert (menopausia["status"], menopausia["unknownReason"]) == (
        "desconocido",
        "respaldo_fallido",
    )
    assert menopausia["studyPopulationValue"] is None and menopausia["citedSources"] == []


@pytest.mark.ac("US-244", 2)
def test_respaldo_deja_respaldo_fallido_y_conserva_las_opciones_cuando_el_llm_entra_en_bucle():
    referencia = _sin_respaldo()

    cuerpo, llm = _consultar("RESP-BUCLE", "O-P9")

    assert llm.invocaciones == 1
    _exigir_respaldo_fallido(cuerpo)
    assert cuerpo["evidenceOptions"] == referencia["evidenceOptions"]


@pytest.mark.ac("US-244", 3)
def test_respaldo_no_produce_local_llm_unavailable_cuando_el_json_llega_truncado():
    cuerpo, _ = _consultar("RESP-TRUNCADO", "O-P9")

    _exigir_respaldo_fallido(cuerpo)
    assert "LOCAL_LLM_UNAVAILABLE" not in str(cuerpo)
    assert "error" not in cuerpo


@pytest.mark.ac("US-244", 4)
def test_respaldo_se_cancela_y_deja_respaldo_fallido_cuando_vence_el_plazo_de_configuracion():
    referencia = _sin_respaldo()

    cuerpo, llm = _consultar("RESP-LENTO", "O-P9", plazo_ms=20)

    assert llm.invocaciones == 1
    _exigir_respaldo_fallido(cuerpo)
    assert cuerpo["evidenceOptions"] == referencia["evidenceOptions"]


@pytest.mark.ac("US-244", 5)
def test_respaldo_no_hace_ninguna_llamada_cuando_las_fuentes_citadas_no_tienen_criterios_pendientes():
    cuerpo, llm = _consultar(
        "RESP-OK", "O-P1", "O-P2", "O-P3", "O-P4", "O-P5", "O-P6", "O-P7", "O-P8"
    )

    assert llm.invocaciones == 0
    assert all(
        f["externalId"] != FICHAS_FX08BC["doc-b9"].external_id for f in cuerpo["applicability"]
    )
    assert cuerpo["status"] == "con_evidencia"


@pytest.mark.ac("US-244", 7)
def test_respaldo_conserva_las_opciones_validadas_cuando_el_llm_cae_despues_de_generar():
    referencia = _sin_respaldo()

    cuerpo, llm = _consultar("RESP-CAIDO", "O-P9")

    assert llm.invocaciones == 1
    _exigir_respaldo_fallido(cuerpo)
    assert cuerpo["evidenceOptions"] == referencia["evidenceOptions"]
    assert len(cuerpo["evidenceOptions"]) == 1
