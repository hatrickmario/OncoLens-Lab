"""Fuentes admitidas y mínimos del corpus ampliado en configuración (US-120 AC-1, AC-4, RN-22, ADR-36 Decisión 7)."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.config.settings import CorpusIngestSettings
from app.scripts.load_seed_corpus import politica_de_licencias
from tests.unit.test_settings_corpus_ingest import con_entorno

CLAVES_NUEVAS = (
    "CORPUS_ALLOWED_SOURCES",
    "CORPUS_MIN_DOCUMENTS_PER_CANCER_TYPE",
    "CORPUS_MIN_SOURCES_PER_CANCER_TYPE",
)


@pytest.fixture(autouse=True)
def sin_claves_nuevas(monkeypatch: pytest.MonkeyPatch) -> None:
    for clave in CLAVES_NUEVAS:
        monkeypatch.delenv(clave, raising=False)


def test_las_fuentes_admitidas_por_defecto_son_las_de_adr_36(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    ajustes = con_entorno(monkeypatch)

    assert ajustes.corpus_allowed_sources == ("NCI", "PMC Open Access", "ClinicalTrials.gov")


def test_las_fuentes_admitidas_se_leen_separadas_por_comas_conservando_los_espacios_internos(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    ajustes = con_entorno(monkeypatch, CORPUS_ALLOWED_SOURCES="NCI, PMC Open Access")

    assert ajustes.corpus_allowed_sources == ("NCI", "PMC Open Access")


def test_los_minimos_por_tipo_de_cancer_valen_20_documentos_y_3_fuentes_por_defecto(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    ajustes = con_entorno(monkeypatch)

    assert ajustes.corpus_min_documents_per_cancer_type == 20
    assert ajustes.corpus_min_sources_per_cancer_type == 3


@pytest.mark.parametrize(
    "clave", ["CORPUS_MIN_DOCUMENTS_PER_CANCER_TYPE", "CORPUS_MIN_SOURCES_PER_CANCER_TYPE"]
)
def test_un_minimo_no_positivo_falla_nombrando_la_clave(
    monkeypatch: pytest.MonkeyPatch, clave: str
) -> None:
    with pytest.raises(ValidationError) as error:
        con_entorno(monkeypatch, **{clave: "0"})

    assert clave.lower() in str(error.value)


def test_una_lista_de_fuentes_admitidas_vacia_falla_cerrada(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    with pytest.raises(ValidationError) as error:
        con_entorno(monkeypatch, CORPUS_ALLOWED_SOURCES=" , ")

    assert "corpus_allowed_sources" in str(error.value)


def test_la_politica_de_licencias_lleva_las_fuentes_admitidas_de_la_configuracion(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    ajustes: CorpusIngestSettings = con_entorno(monkeypatch)

    politica = politica_de_licencias(ajustes, False)

    assert politica.fuentes_admitidas == ajustes.corpus_allowed_sources
