"""`POST /rag/query`, causa del desconocido, aviso del dato del paciente, no comparable y conteo (US-124 / L1D-129).

FR-25, RN-26, RN-28, RN-02. Corpus FX-08b-a, paciente A-M1 y catálogo ``test-apl-1.0.0``; LLM, NLI, reranker y Milvus
falsos. Cada respuesta la valida contra el spec del proveedor el hook de ``verificacion_proveedor.py`` (US-214).
"""

from typing import Any

import pytest

from tests.support.aplicabilidad import (
    GeneradorDeAplicabilidad,
    a_m1_con_diagnostico_sin_verificar,
    a_m1_conflicto,
    entorno_de_aplicabilidad,
    external_id_de,
    solicitud_a_m1,
)
from tests.support.nli_falso import IMPLICA, NliFalso
from tests.support.proponente_falso import ProponenteFalso
from tests.support.recuperacion import Q_SIN

RELEVANCIA_ALTA = 0.90
CLAVES_DE_PUNTAJE = ("score", "peso", "weight", "porcentaje", "percent")


def _consultar(
    documentos: dict[str, float],
    solicitud: dict[str, Any] | None = None,
    **bordes: Any,
) -> dict[str, Any]:
    entorno = entorno_de_aplicabilidad(documentos, **bordes)
    respuesta = entorno.consultar(solicitud or solicitud_a_m1())
    assert respuesta.status_code == 200
    return respuesta.json()


def _fuente_de(cuerpo: dict[str, Any], documento: str) -> dict[str, Any]:
    fuentes = [f for f in cuerpo["applicability"] if f["externalId"] == external_id_de(documento)]
    assert len(fuentes) == 1, f"se esperaba una sola fuente para {documento}"
    return fuentes[0]


def _criterios_de(cuerpo: dict[str, Any], documento: str) -> dict[str, dict[str, Any]]:
    return {c["criterion"]: c for c in _fuente_de(cuerpo, documento)["criteria"]}


def _claves_anidadas(valor: object) -> set[str]:
    if isinstance(valor, dict):
        return set(valor) | {k for v in valor.values() for k in _claves_anidadas(v)}
    if isinstance(valor, list):
        return {k for v in valor for k in _claves_anidadas(v)}
    return set()


@pytest.mark.ac("US-124", 1)
def test_rag_query_marca_estado_menopausico_desconocido_por_falta_en_paciente_con_aviso_faltante_cuando_a_m1_no_lo_tiene():
    cuerpo = _consultar({"doc-a1": RELEVANCIA_ALTA})

    menopausia = _criterios_de(cuerpo, "doc-a1")["estado_menopausico"]
    assert menopausia["status"] == "desconocido"
    assert menopausia["unknownReason"] == "falta_en_paciente"
    assert menopausia["patientValue"] is None
    assert menopausia["patientDataWarning"] == "faltante"


@pytest.mark.ac("US-124", 2)
def test_rag_query_conserva_el_estado_coincide_de_ecog_con_aviso_sin_verificar_cuando_el_ecog_de_a_m1_esta_en_requiere_revision():
    cuerpo = _consultar({"doc-a1": RELEVANCIA_ALTA}, a_m1_con_diagnostico_sin_verificar())

    ecog = _criterios_de(cuerpo, "doc-a1")["ecog"]
    assert (ecog["patientValue"], ecog["status"]) == ("1", "coincide")
    assert ecog["patientDataWarning"] == "sin_verificar"


@pytest.mark.ac("US-124", 3)
def test_rag_query_avisa_en_conflicto_en_estado_her2_y_responde_200_cuando_el_seed_siembra_dos_her2_en_conflicto():
    cuerpo = _consultar({"doc-a1": RELEVANCIA_ALTA}, a_m1_conflicto())

    her2 = _criterios_de(cuerpo, "doc-a1")["estado_her2"]
    assert her2["patientDataWarning"] == "en_conflicto"
    assert (her2["patientValue"], her2["status"]) == (
        "3+ (IHQ)",
        "coincide",
    )  # el aviso no cambia el estado


@pytest.mark.ac("US-124", 4)
def test_rag_query_marca_poblacion_no_comparable_en_doc_a2_cuando_el_excluyente_estado_her2_queda_no_coincide_con_apl_ok():
    cuerpo = _consultar(
        {"doc-a2": RELEVANCIA_ALTA},
        proponente=ProponenteFalso("APL-OK"),
        clasificador_nli=NliFalso(por_defecto=IMPLICA),
    )

    her2 = _criterios_de(cuerpo, "doc-a2")["estado_her2"]
    assert (her2["status"], her2["isExclusionary"]) == ("no_coincide", True)
    assert _fuente_de(cuerpo, "doc-a2")["populationNotComparable"] is True


@pytest.mark.ac("US-124", 5)
def test_rag_query_resume_doc_a1_como_conteo_2_0_0_3_sin_ningun_campo_de_puntaje_cuando_se_evalua_a_m1():
    cuerpo = _consultar({"doc-a1": RELEVANCIA_ALTA})

    fuente = _fuente_de(cuerpo, "doc-a1")
    assert fuente["summary"] == {"coincide": 2, "parcial": 0, "noCoincide": 0, "desconocido": 3}
    assert sum(fuente["summary"].values()) == len(fuente["criteria"]) == 5
    assert fuente["populationNotComparable"] is False
    claves = {k.lower() for k in _claves_anidadas(cuerpo["applicability"])}
    assert not [k for k in claves if any(p in k for p in CLAVES_DE_PUNTAJE)]


@pytest.mark.ac("US-124", 6)
def test_rag_query_devuelve_applicability_vacio_y_cero_invocaciones_del_llm_cuando_q_sin_no_supera_el_umbral():
    generador = GeneradorDeAplicabilidad()
    solicitud = solicitud_a_m1()
    solicitud["query"] = Q_SIN

    cuerpo = _consultar({"doc-a1": RELEVANCIA_ALTA}, solicitud, generador=generador)

    assert cuerpo["status"] == "sin_evidencia"
    assert cuerpo["applicability"] == []
    assert cuerpo["topRelevanceScore"] is None
    assert generador.invocaciones == 0
