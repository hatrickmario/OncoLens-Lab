"""Reglas puras de metadatos del corpus (US-118): verificación por NLI, qué se pide al LLM y cómo se integra lo verificado.

Sin adapters: las reglas viven en ``app/domain/corpus_metadata``.
"""

from __future__ import annotations

from dataclasses import replace
from datetime import date

import pytest

from app.domain.corpus_metadata.extraccion import (
    escalares_a_extraer,
    integrar_metadatos_verificados,
)
from app.domain.corpus_metadata.resultado import CampoDeMetadato
from app.domain.corpus_metadata.verificacion import metadato_verificado
from app.domain.corpus_seed.documento import DocumentoDeSemilla
from app.domain.corpus_seed.poblacion import NO_DISPONIBLE
from app.domain.nli import ResultadoNli

UMBRAL = 0.8
DOCUMENTO = DocumentoDeSemilla(
    document_key="d-1",
    version_group_id="d-1",
    source_type="literature",
    source_name="PMC Open Access",
    external_id="sintetico-1",
    title="Artículo sintético",
    language="en",
    cancer_type_tags=("mama",),
    published_at=date(2024, 1, 1),
    study_design="otro",
    population="adulto",
    original_format="jats_xml",
)


def _implica(p: float) -> ResultadoNli:
    return ResultadoNli(label="entailment", p_entailment=p)


def test_un_metadato_se_verifica_cuando_algun_chunk_lo_implica_sobre_el_umbral() -> None:
    neutral = ResultadoNli(label="neutral", p_entailment=0.1)

    assert metadato_verificado([neutral, _implica(0.95)], UMBRAL)


def test_un_metadato_se_verifica_justo_en_el_umbral() -> None:
    assert metadato_verificado([_implica(UMBRAL)], UMBRAL)


def test_un_metadato_no_se_verifica_bajo_el_umbral() -> None:
    assert not metadato_verificado([_implica(0.79)], UMBRAL)


def test_un_metadato_no_se_verifica_cuando_la_clase_mas_probable_no_es_entailment() -> None:
    contradice = ResultadoNli(label="contradiction", p_entailment=0.99)

    assert not metadato_verificado([contradice], UMBRAL)


def test_un_metadato_no_se_verifica_sin_resultados() -> None:
    assert not metadato_verificado([], UMBRAL)


def test_se_extrae_el_diseno_cuando_el_manifiesto_lo_deja_en_otro() -> None:
    assert escalares_a_extraer(DOCUMENTO) == (
        "study_design",
        "trial_phase",
        "sample_size",
        "primary_endpoint",
    )


def test_no_se_pide_al_llm_lo_que_el_manifiesto_declara() -> None:
    declarado = replace(
        DOCUMENTO, study_design="eca", trial_phase="II", sample_size=40, primary_endpoint="OS"
    )

    assert escalares_a_extraer(declarado) == ()


def test_lo_verificado_se_integra_y_lo_demas_queda_no_disponible() -> None:
    verificados = (
        CampoDeMetadato("study_design", "eca"),
        CampoDeMetadato("sample_size", 500),
        CampoDeMetadato("estadio", "I–III"),
        CampoDeMetadato("biomarcadores.her2", "positivo"),
    )

    metadatos = integrar_metadatos_verificados(DOCUMENTO, verificados)

    assert (metadatos.study_design, metadatos.sample_size) == ("eca", 500)
    assert (metadatos.trial_phase, metadatos.primary_endpoint) == (None, None)
    assert metadatos.population_criteria["estadio"] == "I–III"
    assert metadatos.population_criteria["biomarcadores"] == {"her2": "positivo"}
    assert metadatos.population_criteria["ecog"] == NO_DISPONIBLE
    assert metadatos.metadata_source == "extraido_verificado"


def test_un_diseno_no_verificado_conserva_el_valor_del_manifiesto() -> None:
    metadatos = integrar_metadatos_verificados(DOCUMENTO, ())

    assert metadatos.study_design == "otro"
    assert metadatos.metadata_source == "extraido_verificado"


@pytest.mark.parametrize("campo", ["subtipo", "estadio", "linea", "edad", "ecog"])
def test_cada_criterio_plano_verificado_se_guarda_bajo_su_clave(campo: str) -> None:
    metadatos = integrar_metadatos_verificados(DOCUMENTO, (CampoDeMetadato(campo, "valor"),))

    assert metadatos.population_criteria[campo] == "valor"
