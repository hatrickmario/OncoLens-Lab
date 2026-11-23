"""La ingesta solo admite las fuentes de ADR-36 (US-120 AC-4, RN-21): ``CORPUS_ALLOWED_SOURCES`` y ``fuente_admitida()``."""

from __future__ import annotations

from collections.abc import Callable

import pytest

from app.application.corpus_ingestion.reporte import Estado
from app.domain.corpus_seed.admisibilidad import evaluar_admisibilidad
from tests.integration.corpus_ingestion.conftest import Montaje
from tests.support.semilla import DIRECTORIO_DE_FIXTURES, politica_de_test

MANIFIESTO_DE_FUENTES = DIRECTORIO_DE_FIXTURES / "ingest-manifest-fuentes.yaml"
FUENTES_DE_ADR_36 = ("NCI", "PMC Open Access", "ClinicalTrials.gov")


@pytest.mark.ac("US-120", 4)
def test_ingesta_rechaza_fuente_no_admitida_y_admite_clinicaltrials_como_ensayo_de_dominio_publico(
    fabrica_de_montaje: Callable[..., Montaje],
) -> None:
    """[US-120 AC-4] NICE se rechaza con ``fuente_no_admitida`` y su ``document_key``; ClinicalTrials.gov entra como
    ``clinical_trial`` y ``dominio_publico``."""
    politica = politica_de_test(fuentes_admitidas=FUENTES_DE_ADR_36)
    montaje = fabrica_de_montaje(DIRECTORIO_DE_FIXTURES, politica)

    reporte = montaje.ingerir(MANIFIESTO_DE_FUENTES)

    nice = reporte.resultado_de("f-nice")
    assert (nice.estado, nice.motivo) == (Estado.RECHAZADO_LICENCIA, "fuente_no_admitida")
    assert montaje.filas_de("f-nice") == [("rechazado_licencia", False)]
    assert "f-nice" not in montaje.chunks_por_clave()
    ensayo = reporte.resultado_de("f-ct")
    assert ensayo.estado is Estado.EMBEBIDO
    documento = next(
        d for d in montaje.documentos(MANIFIESTO_DE_FUENTES) if d.document_key == "f-ct"
    )
    assert documento.source_type == "clinical_trial"
    assert evaluar_admisibilidad(documento, politica).license_class == "dominio_publico"
    assert reporte.resultado_de("f-nci").estado is Estado.EMBEBIDO


MANIFIESTO_S7 = DIRECTORIO_DE_FIXTURES / "ingest-manifest-s7-licencia-y-menciones.yaml"
LICENCIA_DE_CLINICALTRIALS = (
    "Datos de ClinicalTrials.gov (obra del gobierno de EE. UU.; condiciones de uso)"
)


@pytest.mark.ac("US-120", 2)
def test_ingesta_embebe_un_registro_de_clinicaltrials_con_el_texto_de_licencia_decidido_como_dominio_publico(
    fabrica_de_montaje: Callable[..., Montaje],
) -> None:
    """[US-120 AC-2] H-3 (S7.1): el texto de licencia de ``[S7 resp. 7]`` mapea a ``dominio_publico`` y el registro queda
    ``embebido``."""
    politica = politica_de_test(fuentes_admitidas=FUENTES_DE_ADR_36)
    montaje = fabrica_de_montaje(DIRECTORIO_DE_FIXTURES, politica)

    reporte = montaje.ingerir(MANIFIESTO_S7)

    assert reporte.resultado_de("f-ct-s7").estado is Estado.EMBEBIDO
    documento = next(d for d in montaje.documentos(MANIFIESTO_S7) if d.document_key == "f-ct-s7")
    assert documento.license == LICENCIA_DE_CLINICALTRIALS
    assert evaluar_admisibilidad(documento, politica).license_class == "dominio_publico"


@pytest.mark.ac("US-120", 2)
def test_queda_embebido_cuando_un_articulo_cc_by_cita_una_fuente_excluida_en_sus_referencias(
    fabrica_de_montaje: Callable[..., Montaje],
) -> None:
    """[US-120 AC-2] H-4 (S7.2, ``[S7 resp. 8]``): NCCN y ESMO en la bibliografía de un artículo CC BY de PMC no lo
    excluyen (la fuente del documento es PMC); sus chunks quedan vigentes."""
    politica = politica_de_test(fuentes_admitidas=FUENTES_DE_ADR_36)
    montaje = fabrica_de_montaje(DIRECTORIO_DE_FIXTURES, politica)

    reporte = montaje.ingerir(MANIFIESTO_S7)

    assert reporte.resultado_de("f-pmc-cita-excluida").estado is Estado.EMBEBIDO
    assert montaje.filas_de("f-pmc-cita-excluida") == [("embebido", True)]
    assert "f-pmc-cita-excluida" in montaje.chunks_vigentes_por_clave()
    textos = " ".join(montaje.textos_de_chunks("f-pmc-cita-excluida"))
    assert "NCCN" in textos and "ESMO" in textos
