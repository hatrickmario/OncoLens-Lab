"""Humo de FX-08b-c (US-243, tarea 1.1): el catálogo ``test-apl-1.2.0``, el corpus en lista y los pacientes se corresponden."""

from app.domain.aplicabilidad_tipos import ValorDePoblacion
from tests.support.aplicabilidad import criterios_de
from tests.support.catalogo_aplicabilidad import APL_1_2_0
from tests.support.poblacion_fx08bc import (
    CHUNKS_DE_DOCUMENTO,
    CORPUS_FX08BC,
    FICHAS_FX08BC,
    OPCIONES_LLM_POB,
    POBLACIONES_FX08BC,
    solicitud_a_m2,
    solicitud_a_m3,
)


def test_catalogo_1_2_0_trae_los_seis_criterios_de_mama_cuando_se_carga():
    claves = [c.clave for c in criterios_de(APL_1_2_0).criterios("mama")]

    assert claves == [
        "estado_her2",
        "estadio",
        "ecog",
        "estado_menopausico",
        "linea_tratamiento",
        "receptores_hormonales",
    ]


def test_cada_valor_de_la_poblacion_apunta_a_un_chunk_del_corpus_cuando_se_leen_los_documentos():
    chunks = {c.chunk_id: c.document_id for c in CORPUS_FX08BC}
    assert set(CHUNKS_DE_DOCUMENTO) == set(FICHAS_FX08BC)

    for documento, poblacion in POBLACIONES_FX08BC.items():
        for criterio in poblacion.criterios.values():
            for valor in criterio.valores:
                assert isinstance(valor, ValorDePoblacion)
                assert chunks[valor.chunk_id or ""] == documento


def test_llm_pob_cita_solo_chunks_del_corpus_cuando_se_listan_las_diez_opciones():
    assert len(OPCIONES_LLM_POB) == 10
    assert {c for citas in OPCIONES_LLM_POB.values() for c in citas} <= {
        c.chunk_id for c in CORPUS_FX08BC
    }


def test_a_m2_y_a_m3_solo_difieren_en_el_estado_menopausico_cuando_se_arman():
    m2, m3 = solicitud_a_m2(), solicitud_a_m3()

    assert m2["clinicalContext"]["attributes"][0]["value"] == "posmenopáusica"
    assert m3["clinicalContext"]["attributes"][0]["value"] == "premenopáusica"
    m3["clinicalContext"]["attributes"][0]["value"] = "posmenopáusica"
    assert m2 == m3
