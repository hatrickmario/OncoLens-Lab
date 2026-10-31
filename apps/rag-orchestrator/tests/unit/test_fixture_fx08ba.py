"""Humo de FX-08b-a (L1D-127, tarea 1.1): los documentos, el paciente A-M1 y el catálogo de test se corresponden."""

import asyncio

from app.domain.aplicabilidad_tipos import PoblacionDelEstudio, ValorDePoblacion
from app.domain.applicability_text import CriterioPendiente, FuenteParaProponer
from app.schemas.generated.models import RagQueryInternalRequest
from tests.support.aplicabilidad import (
    CORPUS_FX08BA,
    CRITERIOS_DE_DOC_A1,
    DOCUMENTOS_FX08BA,
    FICHAS_FX08BA,
    POBLACIONES_FX08BA,
    TEXTO_DE_CH_A2_1,
    criterios_de_test_apl_1_0_0,
    external_id_de,
    solicitud_a_m1,
)
from tests.support.proponente_falso import ProponenteFalso

CLAVES_DEL_CATALOGO_DE_TEST = {
    "estado_her2": "biomarcadores.her2",
    "estadio": "estadio",
    "ecog": "ecog",
    "estado_menopausico": "estado_menopausico",
    "linea_tratamiento": "linea",
}


def test_fixture_fx08ba_trae_un_chunk_una_ficha_y_una_poblacion_por_documento_cuando_se_carga():
    assert {c.document_id for c in CORPUS_FX08BA} == set(DOCUMENTOS_FX08BA)
    assert set(FICHAS_FX08BA) == set(DOCUMENTOS_FX08BA)
    assert len({f.external_id for f in FICHAS_FX08BA.values()}) == len(DOCUMENTOS_FX08BA)
    assert set(POBLACIONES_FX08BA) == set(DOCUMENTOS_FX08BA)


def test_fixture_fx08ba_usa_la_forma_real_de_l1d_117_cuando_siembra_biomarcadores_como_objeto():
    doc_a1 = POBLACIONES_FX08BA["doc-a1"]
    doc_a3 = POBLACIONES_FX08BA["doc-a3"]

    assert CRITERIOS_DE_DOC_A1["biomarcadores"] == {"her2": "positivo"}
    assert doc_a1.criterios["biomarcadores.her2"].valores == (
        ValorDePoblacion("positivo", "elegibilidad", None),
    )
    assert doc_a3.criterios["biomarcadores"].valores == ()
    assert POBLACIONES_FX08BA["doc-a5"].criterios["ecog"].valores == (
        ValorDePoblacion("0-1", "subgrupo", None),
    )
    assert POBLACIONES_FX08BA["doc-a6"].metadata_source == "pendiente"


def test_fixture_fx08ba_no_siembra_claves_que_la_ingesta_no_produce_cuando_se_arma_la_poblacion():
    prohibidas = {"grado", "estado_menopausico", "estado_castracion"}

    for poblacion in POBLACIONES_FX08BA.values():
        assert isinstance(poblacion, PoblacionDelEstudio)
        assert not prohibidas & set(poblacion.criterios)


def test_fixture_fx08ba_declara_el_study_key_de_l1d_126_cuando_se_leen_los_criterios_de_mama():
    criterios = criterios_de_test_apl_1_0_0().criterios("mama")

    assert {c.clave: c.clave_de_estudio for c in criterios} == CLAVES_DEL_CATALOGO_DE_TEST


def test_fixture_fx08ba_arma_a_m1_valido_contra_el_contrato_cuando_se_construye_la_solicitud():
    solicitud = RagQueryInternalRequest.model_validate(solicitud_a_m1())

    contexto = solicitud.clinicalContext
    assert [b.value.root for b in contexto.biomarkers if b.biomarkerName.root == "HER2"] == [
        "3+ (IHQ)"
    ]
    assert contexto.diagnosis is not None
    assert (contexto.diagnosis.stageValue.root, contexto.diagnosis.performanceValue) == ("IIA", 1)
    assert [t.lineNumber for t in contexto.priorTreatments] == [1]
    assert contexto.attributes == []


def test_fixture_fx08ba_trae_doc_a2_pendiente_con_ch_a2_1_cuando_se_carga_la_guia_sin_poblacion():
    chunk = next(c for c in CORPUS_FX08BA if c.chunk_id == "ch-a2-1")

    assert (chunk.document_id, chunk.texto) == ("doc-a2", TEXTO_DE_CH_A2_1)
    assert POBLACIONES_FX08BA["doc-a2"].metadata_source == "pendiente"


def test_proponente_falso_solo_habla_de_la_fuente_y_el_criterio_que_recibio_y_registra_la_llamada():
    proponente = ProponenteFalso("APL-OK")
    her2 = CriterioPendiente("estado_her2", "Estado de HER2", None)
    estadio = CriterioPendiente("estadio", "Estadio", None)
    otra = FuenteParaProponer(external_id_de("doc-a1"), (her2,), ())
    a2_estadio = FuenteParaProponer(external_id_de("doc-a2"), (estadio,), ())
    a2 = FuenteParaProponer(external_id_de("doc-a2"), (her2,), ())

    assert asyncio.run(proponente.proponer(otra)) == ()
    assert asyncio.run(proponente.proponer(a2_estadio)) == ()
    (propuesta,) = asyncio.run(proponente.proponer(a2))

    assert (propuesta.criterio, propuesta.valor, propuesta.chunk_id) == (
        "estado_her2",
        "HER2 negativo",
        "ch-a2-1",
    )
    assert proponente.invocaciones == 3
