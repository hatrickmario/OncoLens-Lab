"""La ingesta solo admite las fuentes de ADR-36 (US-120 AC-4, RN-21): ``CORPUS_ALLOWED_SOURCES`` y ``fuente_admitida()``."""

from __future__ import annotations

from collections.abc import Callable

import pytest

from app.application.corpus_ingestion.reporte import Estado
from app.domain.corpus_seed.admisibilidad import evaluar_admisibilidad
from tests.integration.corpus_ingestion.conftest import Montaje, montar
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


def test_ingesta_no_rechaza_por_fuente_cuando_la_politica_no_declara_lista() -> None:
    montaje = montar(DIRECTORIO_DE_FIXTURES, politica_de_test())

    reporte = montaje.ingerir(MANIFIESTO_DE_FUENTES)

    assert reporte.resultado_de("f-nice").estado is Estado.EMBEBIDO
