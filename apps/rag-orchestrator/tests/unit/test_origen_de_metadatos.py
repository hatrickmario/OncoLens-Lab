"""Procedencia de los metadatos (US-118, D2, RN-25): regla pura ``origen_de_metadatos`` y copia de la fuente."""

from __future__ import annotations

from dataclasses import replace
from datetime import date

from app.domain.corpus_metadata.origen import (
    OrigenDeMetadatos,
    metadatos_de_la_fuente,
    origen_de_metadatos,
)
from app.domain.corpus_seed.documento import DocumentoDeSemilla
from app.domain.corpus_seed.poblacion import CRITERIOS_DE_POBLACION, NO_DISPONIBLE

DOCUMENTO = DocumentoDeSemilla(
    document_key="d-1",
    version_group_id="d-1",
    source_type="clinical_trial",
    source_name="ClinicalTrials.gov",
    external_id="NCT00000001",
    title="Ensayo sintético",
    language="en",
    cancer_type_tags=("prostata",),
    published_at=date(2024, 6, 1),
    study_design="eca",
    population="adulto",
    original_format="xml",
)


def test_la_fuente_estructurada_gana_cuando_el_manifiesto_trae_criterios_de_poblacion() -> None:
    documento = replace(DOCUMENTO, population_criteria={"ecog": "0-1"})

    assert origen_de_metadatos(documento) is OrigenDeMetadatos.FUENTE_ESTRUCTURADA


def test_se_extrae_cuando_el_manifiesto_no_trae_criterios_de_poblacion() -> None:
    assert origen_de_metadatos(DOCUMENTO) is OrigenDeMetadatos.EXTRACCION
    assert origen_de_metadatos(replace(DOCUMENTO, population_criteria={})) is (
        OrigenDeMetadatos.EXTRACCION
    )


def test_los_metadatos_de_la_fuente_copian_lo_publicado_y_dejan_el_resto_no_disponible() -> None:
    documento = replace(
        DOCUMENTO, population_criteria={"ecog": "0-1"}, trial_phase="III", sample_size=40
    )

    metadatos = metadatos_de_la_fuente(documento)

    assert metadatos.metadata_source == "fuente_estructurada"
    assert (metadatos.study_design, metadatos.trial_phase, metadatos.sample_size) == (
        "eca",
        "III",
        40,
    )
    assert metadatos.population_criteria["ecog"] == "0-1"
    assert set(metadatos.population_criteria) == set(CRITERIOS_DE_POBLACION)
    assert metadatos.population_criteria["estadio"] == NO_DISPONIBLE
