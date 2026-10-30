"""`POST /rag/query`, herencia de la aplicabilidad y recorte por aplicabilidad (US-125 / L1D-130): RN-28, RN-03, RN-01, FR-09.

FX-08b-b: tres documentos (``doc-a4`` 0,92 · ``doc-a1`` 0,70 · ``doc-a6`` 0,60), paciente A-M1, catálogo ``test-apl-1.0.0`` y
``maxOptions = 1``; LLM, NLI, reranker y Milvus falsos. Cada respuesta la valida contra el spec del proveedor el hook de
``verificacion_proveedor.py``.
"""

from typing import Any

import pytest

from tests.support.aplicabilidad import (
    FICHAS_FX08BA,
    POBLACIONES_FX08BB,
    RELEVANCIAS_FX08BB,
    GeneradorDeDosOpciones,
    entorno_de_aplicabilidad,
    OPCION_O_A,
    OPCION_O_B,
    OPCION_O_B_SIN_SOPORTE,
    OPCION_O_D,
    RAZON_B_SIN_SOPORTE,
    entorno_de_dos_opciones,
    external_id_de,
    solicitud_a_m1_con_max_opciones,
)
from tests.support.nli_falso import IMPLICA, NEUTRAL, NliFalso
from tests.support.recuperacion import CatalogoFalso

RESUMEN_DE_DOC_A1 = {"coincide": 2, "parcial": 0, "noCoincide": 0, "desconocido": 3}
RESUMEN_DE_DOC_A4 = {"coincide": 0, "parcial": 0, "noCoincide": 1, "desconocido": 4}


def _consultar(
    escenario: str, *, nli: NliFalso | None = None, max_options: int = 1
) -> dict[str, Any]:
    entorno = entorno_de_dos_opciones(escenario, clasificador_nli=nli)
    respuesta = entorno.consultar(solicitud_a_m1_con_max_opciones(max_options))
    assert respuesta.status_code == 200
    return respuesta.json()


def _nombres(opciones: list[dict[str, Any]]) -> list[str]:
    return [o["option"] for o in opciones]


@pytest.mark.ac("US-125", 5)
def test_rag_query_devuelve_o_b_y_no_o_a_cuando_max_options_es_1_y_la_mas_relevante_tiene_un_excluyente_en_no_coincide():
    cuerpo = _consultar("LLM-DOS-APL")

    assert cuerpo["status"] == "con_evidencia"
    assert _nombres(cuerpo["evidenceOptions"]) == [OPCION_O_B]
    assert OPCION_O_A not in _nombres(cuerpo["discardedOptions"])
    opcion = cuerpo["evidenceOptions"][0]
    assert opcion["applicabilitySummary"] == RESUMEN_DE_DOC_A1
    assert opcion["perSource"] == [
        {
            "externalId": external_id_de("doc-a1"),
            "summary": RESUMEN_DE_DOC_A1,
            "populationNotComparable": False,
        }
    ]
    assert opcion["populationNotComparable"] is False
    assert opcion["warnings"] == []
    assert opcion["relevanceScore"] == 0.70
    fuente = next(f for f in cuerpo["applicability"] if f["externalId"] == external_id_de("doc-a1"))
    estadio = next(c for c in fuente["criteria"] if c["criterion"] == "estadio")
    assert estadio["unknownReason"] == "sin_regla_de_comparacion"


@pytest.mark.ac("US-125", 6)
def test_rag_query_devuelve_o_b_cuando_o_b_y_o_d_empatan_en_conteos_y_o_b_es_mas_relevante():
    cuerpo = _consultar("LLM-EMPATE-APL")

    assert _nombres(cuerpo["evidenceOptions"]) == [OPCION_O_B]
    assert OPCION_O_D not in _nombres(cuerpo["discardedOptions"])
    assert cuerpo["evidenceOptions"][0]["applicabilitySummary"] == RESUMEN_DE_DOC_A1


@pytest.mark.ac("US-125", 7)
def test_rag_query_devuelve_o_a_y_descarta_o_b_prima_por_soporte_cuando_la_mas_aplicable_no_tiene_soporte_nli():
    nli = NliFalso(resultados={RAZON_B_SIN_SOPORTE: NEUTRAL}, por_defecto=IMPLICA)

    cuerpo = _consultar("LLM-SIN-SOPORTE-APL", nli=nli)

    assert _nombres(cuerpo["evidenceOptions"]) == [OPCION_O_A]
    descartadas = {d["option"]: d["discardReason"] for d in cuerpo["discardedOptions"]}
    assert descartadas == {OPCION_O_B_SIN_SOPORTE: "afirmacion_sin_soporte"}
    opcion = cuerpo["evidenceOptions"][0]
    assert opcion["applicabilitySummary"] == RESUMEN_DE_DOC_A4
    assert opcion["populationNotComparable"] is True
    assert opcion["warnings"] == ["poblacion_no_comparable"]


def test_rag_query_agrega_en_cero_y_no_falla_cuando_la_fuente_citada_no_tiene_entrada_en_applicability():
    sin_doc_a1 = {k: v for k, v in POBLACIONES_FX08BB.items() if k != "doc-a1"}
    entorno = entorno_de_aplicabilidad(
        RELEVANCIAS_FX08BB,
        generador=GeneradorDeDosOpciones("LLM-DOS-APL"),
        catalogo_falso=CatalogoFalso(fichas=FICHAS_FX08BA, poblaciones=sin_doc_a1),
    )

    respuesta = entorno.consultar(solicitud_a_m1_con_max_opciones(2))

    assert respuesta.status_code == 200
    por_nombre = {o["option"]: o for o in respuesta.json()["evidenceOptions"]}
    sin_entrada = por_nombre[OPCION_O_B]
    assert sin_entrada["applicabilitySummary"] == {
        "coincide": 0,
        "parcial": 0,
        "noCoincide": 0,
        "desconocido": 0,
    }
    assert (
        sin_entrada["perSource"],
        sin_entrada["populationNotComparable"],
        sin_entrada["warnings"],
    ) == ([], False, [])
