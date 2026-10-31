"""`POST /rag/query`, respaldo de la población en la consulta (US-244 / L1D-294): ADR-47 etapa C, RN-01, RN-26, RN-14.

FX-08b-c: paciente A-M2, corpus ``doc-b1``…``doc-b10`` (``doc-b9`` con ``estado_menopausico`` ``pendiente``), catálogo
``test-apl-1.2.0`` y el LLM de opciones ``LLM-POB``; el LLM del respaldo (``RESP-*``), el NLI, el reranker y Milvus son
falsos. El adapter real de la tarea corta construye el prompt. Cada respuesta la valida contra el spec del proveedor el
hook de ``verificacion_proveedor.py`` (US-214).
"""

from typing import Any

import pytest

from tests.support.nli_falso import IMPLICA, NliFalso
from tests.support.poblacion_fx08bc import (
    FICHAS_FX08BC,
    TEXTO_DE_CH_B9_1,
    entorno_fx08bc,
    solicitud_a_m2,
)
from tests.support.respaldo_poblacion import (
    RespaldoLlmFalso,
    tarea_de_respaldo,
)


def _consultar(
    escenario: str, *opciones: str, nli: NliFalso | None = None
) -> tuple[dict[str, Any], RespaldoLlmFalso]:
    llm = RespaldoLlmFalso(escenario)
    entorno = entorno_fx08bc(
        *opciones,
        proponente=tarea_de_respaldo(llm),
        clasificador_nli=nli or NliFalso(por_defecto=IMPLICA),
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
