"""`POST /rag/query`, hasta tres opciones ordenadas por aplicabilidad (US-134 / L1D-144): RN-28, RN-03, RN-01, RN-26, FR-09.

FX-10c-a: cuatro documentos (``doc-a4`` 0,92 · ``doc-a3`` 0,85 · ``doc-a1`` 0,70 · ``doc-a6`` 0,60), paciente A-M1, catálogo
``test-apl-1.0.0`` y ``maxOptions = 3``; LLM, NLI, reranker y Milvus falsos. Cada respuesta la valida contra el spec del
proveedor el hook de ``verificacion_proveedor.py``.
"""

import itertools
import logging
from typing import Any

import pytest

from tests.support.aplicabilidad import (
    OPCION_O_A,
    OPCION_O_B,
    OPCION_O_C,
    OPCION_O_D,
    OPCION_O_E,
    OPCION_O_F,
    RAZON_E_SIN_SOPORTE,
    entorno_fx10ca,
    external_id_de,
    solicitud_a_m1_con_max_opciones,
)
from tests.support.nli_falso import IMPLICA, NEUTRAL, NliFalso

NLI_SIN_SOPORTE_DE_O_E = NliFalso(resultados={RAZON_E_SIN_SOPORTE: NEUTRAL}, por_defecto=IMPLICA)


def _consultar(escenario: str, *, orden: tuple[int, ...] | None = None) -> dict[str, Any]:
    entorno = entorno_fx10ca(escenario, orden=orden, clasificador_nli=NLI_SIN_SOPORTE_DE_O_E)
    respuesta = entorno.consultar(solicitud_a_m1_con_max_opciones(3))
    assert respuesta.status_code == 200
    return respuesta.json()


def _nombres(opciones: list[dict[str, Any]]) -> list[str]:
    return [o["option"] for o in opciones]


@pytest.mark.ac("US-134", 1)
def test_rag_query_devuelve_b_d_c_con_la_relevancia_solo_como_desempate_cuando_max_options_es_3():
    cuerpo = _consultar("LLM-CUATRO")

    assert _nombres(cuerpo["evidenceOptions"]) == [OPCION_O_B, OPCION_O_D, OPCION_O_C]
    puntajes = [o["relevanceScore"] for o in cuerpo["evidenceOptions"]]
    assert puntajes == [0.70, 0.60, 0.85]


@pytest.mark.ac("US-134", 3)
def test_rag_query_declara_options_not_shown_1_sin_contenido_de_o_a_cuando_hay_un_excedente(caplog):
    caplog.set_level(logging.INFO)

    cuerpo = _consultar("LLM-CUATRO")

    assert cuerpo["optionsNotShown"] == 1
    assert OPCION_O_A not in _nombres(cuerpo["evidenceOptions"])
    assert OPCION_O_A not in _nombres(cuerpo["discardedOptions"])
    assert OPCION_O_A not in str(cuerpo)
    assert OPCION_O_A not in caplog.text
    assert external_id_de("doc-a4") not in caplog.text


@pytest.mark.ac("US-134", 3)
def test_rag_query_declara_options_not_shown_0_presente_cuando_no_hay_recorte():
    cuerpo = _consultar("LLM-TRES")

    assert cuerpo["optionsNotShown"] == 0


@pytest.mark.ac("US-134", 4)
def test_rag_query_deja_o_a_ultima_y_visible_con_aviso_cuando_su_poblacion_no_es_comparable():
    cuerpo = _consultar("LLM-TRES")

    assert _nombres(cuerpo["evidenceOptions"]) == [OPCION_O_B, OPCION_O_C, OPCION_O_A]
    ultima = cuerpo["evidenceOptions"][-1]
    assert ultima["populationNotComparable"] is True
    assert ultima["warnings"] == ["poblacion_no_comparable"]


@pytest.mark.ac("US-134", 5)
def test_rag_query_descarta_o_e_sin_ocupar_posicion_cuando_su_afirmacion_principal_no_tiene_soporte():
    cuerpo = _consultar("LLM-CUATRO")

    descartadas = {d["option"]: d["discardReason"] for d in cuerpo["discardedOptions"]}
    assert descartadas == {OPCION_O_E: "afirmacion_sin_soporte"}
    assert OPCION_O_E not in _nombres(cuerpo["evidenceOptions"])
    assert cuerpo["optionsNotShown"] == 1


@pytest.mark.ac("US-134", 6)
@pytest.mark.parametrize("orden", list(itertools.permutations(range(4))))
def test_rag_query_mantiene_el_orden_cuando_el_llm_emite_las_opciones_en_cualquier_permutacion(
    orden,
):
    cuerpo = _consultar("LLM-CUATRO", orden=orden + (4,))

    assert _nombres(cuerpo["evidenceOptions"]) == [OPCION_O_B, OPCION_O_D, OPCION_O_C]


@pytest.mark.ac("US-134", 7)
def test_rag_query_compara_o_f_con_doc_a1_y_no_con_doc_a4_cuando_cita_ambas_fuentes():
    cuerpo = _consultar("LLM-MULTIFUENTE")

    assert _nombres(cuerpo["evidenceOptions"]) == [OPCION_O_F, OPCION_O_A]
    o_f = cuerpo["evidenceOptions"][0]
    assert o_f["applicabilitySummary"] == {
        "coincide": 2,
        "parcial": 0,
        "noCoincide": 0,
        "desconocido": 3,
    }
    assert o_f["perSource"][0]["externalId"] == external_id_de("doc-a1")
