"""`POST /rag/query`, camino textual de la aplicabilidad (US-123 / L1D-128): FR-25, RN-01, RN-04, ADR-34.

Corpus FX-08b-a con ``doc-a2`` (guía ``pendiente`` con ``ch-a2-1``), paciente A-M1 y catálogo ``test-apl-1.0.0``; el LLM
de aplicabilidad, el NLI, el reranker y Milvus son falsos. Cada respuesta la valida contra el spec del proveedor el hook
de ``verificacion_proveedor.py`` (US-214).
"""

import json
import logging
from pathlib import Path
from typing import Any

import pytest

from app.domain.nli import ParNli
from app.prompts.aplicabilidad_texto import VERSION_DEL_PROMPT_APLICABILIDAD
from app.prompts.rag_query import VERSION_DEL_PROMPT
from tests.support.aplicabilidad import (
    TEXTO_DE_CH_A2_1,
    entorno_de_aplicabilidad,
    escribir_aplicabilidad,
    external_id_de,
    solicitud_a_m1,
)
from tests.support.catalogo_aplicabilidad import APL_1_0_0
from tests.support.nli_falso import IMPLICA, NEUTRAL, NliFalso
from tests.support.proponente_falso import ProponenteFalso

RELEVANCIA_ALTA = 0.90
SOLO_DOC_A2 = {"doc-a2": RELEVANCIA_ALTA}


def _responder(
    proponente: ProponenteFalso,
    nli: NliFalso,
    documentos: dict[str, float] | None = None,
    *,
    catalogo: Path = APL_1_0_0,
):
    entorno = entorno_de_aplicabilidad(
        documentos or SOLO_DOC_A2, catalogo=catalogo, proponente=proponente, clasificador_nli=nli
    )
    return entorno.consultar(solicitud_a_m1(catalogo.name))


def _consultar(
    proponente: ProponenteFalso, nli: NliFalso, documentos: dict[str, float] | None = None
) -> dict[str, Any]:
    respuesta = _responder(proponente, nli, documentos)
    assert respuesta.status_code == 200
    return respuesta.json()


def _criterios_de(cuerpo: dict[str, Any], documento: str) -> dict[str, dict[str, Any]]:
    fuentes = [f for f in cuerpo["applicability"] if f["externalId"] == external_id_de(documento)]
    assert len(fuentes) == 1, f"se esperaba una sola fuente para {documento}"
    return {c["criterion"]: c for c in fuentes[0]["criteria"]}


def _texto_completo(cuerpo: dict[str, Any]) -> list[str]:
    """La respuesta serializada con y sin escapes: el texto no puede aparecer de ninguna de las dos formas."""
    return [json.dumps(cuerpo, ensure_ascii=False), json.dumps(cuerpo)]


@pytest.mark.ac("US-123", 1)
def test_rag_query_acepta_her2_negativo_citando_ch_a2_1_y_queda_no_coincide_cuando_apl_ok_y_nli_en_entailment():
    nli = NliFalso(por_defecto=IMPLICA)

    cuerpo = _consultar(ProponenteFalso("APL-OK"), nli)

    her2 = _criterios_de(cuerpo, "doc-a2")["estado_her2"]
    assert (her2["patientValue"], her2["studyPopulationValue"], her2["status"]) == (
        "3+ (IHQ)",
        "HER2 negativo",
        "no_coincide",
    )
    assert her2["unknownReason"] is None
    assert [c["chunkId"] for c in her2["citedSources"]] == ["ch-a2-1"]
    assert [c["externalId"] for c in her2["citedSources"]] == [external_id_de("doc-a2")]
    assert (
        her2["citedSources"][0]["chunkTextSnapshot"] == TEXTO_DE_CH_A2_1
    )  # copiado del corpus (RN-04)
    assert ParNli(TEXTO_DE_CH_A2_1, "HER2 negativo") in nli.pares_recibidos


@pytest.mark.ac("US-123", 2)
def test_rag_query_deja_estadio_desconocido_sin_el_texto_y_suma_un_omitido_cuando_apl_sin_soporte_y_nli_neutral():
    sin_propuesta = _consultar(ProponenteFalso("APL-SILENCIO"), NliFalso(por_defecto=IMPLICA))
    nli = NliFalso(resultados={"estadio I–III": NEUTRAL}, por_defecto=IMPLICA)

    cuerpo = _consultar(ProponenteFalso("APL-SIN-SOPORTE"), nli)

    estadio = _criterios_de(cuerpo, "doc-a2")["estadio"]
    assert (estadio["status"], estadio["unknownReason"]) == (
        "desconocido",
        "no_reportado_por_fuente",
    )
    assert estadio["studyPopulationValue"] is None
    assert estadio["citedSources"] == []
    assert ParNli(TEXTO_DE_CH_A2_1, "estadio I–III") in nli.pares_recibidos
    for texto in _texto_completo(cuerpo):
        assert "estadio I–III" not in texto and "estadio I\\u2013III" not in texto
    assert cuerpo["omittedClaims"] == sin_propuesta["omittedClaims"] + 1


@pytest.mark.ac("US-123", 3)
def test_rag_query_deja_el_criterio_desconocido_sin_cita_y_sin_nli_cuando_apl_cita_ajena_cita_ch_x_999():
    sin_propuesta = _consultar(ProponenteFalso("APL-SILENCIO"), NliFalso(por_defecto=IMPLICA))
    nli = NliFalso(por_defecto=IMPLICA)

    cuerpo = _consultar(ProponenteFalso("APL-CITA-AJENA"), nli)

    her2 = _criterios_de(cuerpo, "doc-a2")["estado_her2"]
    assert (her2["status"], her2["unknownReason"]) == ("desconocido", "no_reportado_por_fuente")
    assert her2["studyPopulationValue"] is None and her2["citedSources"] == []
    assert all("ch-x-999" not in texto for texto in _texto_completo(cuerpo))
    assert nli.invocaciones == 0
    assert cuerpo["omittedClaims"] == sin_propuesta["omittedClaims"] + 1


@pytest.mark.ac("US-123", 4)
def test_rag_query_deja_linea_tratamiento_desconocido_sin_sumar_omitidos_cuando_el_llm_no_propone_nada_para_ella():
    sin_propuesta = _consultar(ProponenteFalso("APL-SILENCIO"), NliFalso(por_defecto=IMPLICA))

    cuerpo = _consultar(ProponenteFalso("APL-OK"), NliFalso(por_defecto=IMPLICA))

    linea = _criterios_de(cuerpo, "doc-a2")["linea_tratamiento"]
    assert (linea["patientValue"], linea["status"], linea["unknownReason"]) == (
        "1",
        "desconocido",
        "no_reportado_por_fuente",
    )
    assert linea["studyPopulationValue"] is None and linea["citedSources"] == []
    assert cuerpo["omittedClaims"] == sin_propuesta["omittedClaims"] == 0


@pytest.mark.ac("US-123", 4)
def test_rag_query_incorpora_el_documento_pendiente_con_todo_desconocido_cuando_el_llm_no_propone_nada():
    proponente = ProponenteFalso("APL-SILENCIO")

    cuerpo = _consultar(
        proponente, NliFalso(por_defecto=IMPLICA), {"doc-a1": RELEVANCIA_ALTA, "doc-a6": 0.80}
    )

    assert {f["externalId"] for f in cuerpo["applicability"]} == {
        external_id_de("doc-a1"),
        external_id_de("doc-a6"),
    }
    criterios = _criterios_de(cuerpo, "doc-a6")
    assert all(c["status"] == "desconocido" for c in criterios.values())
    assert all(c["studyPopulationValue"] is None for c in criterios.values())
    assert criterios["estado_her2"]["unknownReason"] == "no_reportado_por_fuente"
    assert criterios["estado_menopausico"]["unknownReason"] == "falta_en_paciente"
    assert cuerpo["omittedClaims"] == 0


@pytest.mark.ac("US-123", 5)
def test_rag_query_responde_503_nli_unavailable_sin_aplicabilidad_cuando_el_nli_falla_al_validar_una_propuesta():
    nli = NliFalso(error=RuntimeError("nli caído"))

    respuesta = _responder(ProponenteFalso("APL-OK"), nli)

    assert respuesta.status_code == 503
    cuerpo = respuesta.json()
    assert cuerpo["error"] == "NLI_UNAVAILABLE"
    assert not {"applicability", "evidenceOptions"} & set(cuerpo)
    assert "HER2 negativo" not in respuesta.text
    assert (
        ParNli(TEXTO_DE_CH_A2_1, "HER2 negativo") in nli.pares_recibidos
    )  # falló al validar la propuesta


def test_rag_query_reporta_ambas_versiones_del_prompt_sin_valores_en_el_log_cuando_el_camino_textual_invoca_al_llm(
    caplog,
):
    caplog.set_level(logging.DEBUG)

    cuerpo = _consultar(ProponenteFalso("APL-OK"), NliFalso(por_defecto=IMPLICA))

    assert (
        cuerpo["meta"]["promptVersion"]
        == f"{VERSION_DEL_PROMPT}+{VERSION_DEL_PROMPT_APLICABILIDAD}"
    )
    assert " " not in cuerpo["meta"]["promptVersion"]
    registros = [r.getMessage() for r in caplog.records]
    assert any(
        f"applicabilityPromptVersion={VERSION_DEL_PROMPT_APLICABILIDAD}" in r for r in registros
    )
    for registro in registros:
        assert "HER2 negativo" not in registro and TEXTO_DE_CH_A2_1 not in registro


def _catalogo_con_tres_criterios_estructurados(raiz: Path) -> Path:
    """Catálogo de test (``test-apl-1.0.0``) con solo los criterios que ``doc-a1`` trae estructurados."""
    catalogo = raiz / APL_1_0_0.name
    original = json.loads((APL_1_0_0 / "mama" / "aplicabilidad.json").read_text(encoding="utf-8"))
    por_clave = {item["key"]: item for item in original["items"]}
    escribir_aplicabilidad(
        catalogo, "mama", [por_clave[k] for k in ("estado_her2", "estadio", "ecog")]
    )
    escribir_aplicabilidad(catalogo, "prostata", [])
    return catalogo


def test_rag_query_reporta_solo_la_version_del_generador_y_no_invoca_al_proponente_cuando_todo_es_estructurado(
    tmp_path: Path,
):
    proponente = ProponenteFalso("APL-OK")
    catalogo = _catalogo_con_tres_criterios_estructurados(tmp_path)

    respuesta = _responder(
        proponente, NliFalso(por_defecto=IMPLICA), {"doc-a1": RELEVANCIA_ALTA}, catalogo=catalogo
    )

    assert respuesta.status_code == 200
    assert respuesta.json()["meta"]["promptVersion"] == VERSION_DEL_PROMPT
    assert proponente.invocaciones == 0
