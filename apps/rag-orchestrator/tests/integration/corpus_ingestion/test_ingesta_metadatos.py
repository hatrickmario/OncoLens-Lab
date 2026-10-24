"""Metadatos de la ingesta (US-118, L1D-117): aceptación de AC-1…AC-4 y AC-6 sobre FX-06c-b ampliada.

Integración: el ``IngestionPipelineService`` real con el ``MetadataExtractionService`` real; se fingen solo los bordes
(LLM de metadatos, NLI, embeddings). Reloj e ids congelados.
"""

from __future__ import annotations

import pytest

from app.domain.corpus_seed.poblacion import CRITERIOS_DE_POBLACION
from tests.integration.corpus_ingestion.conftest import Montaje
from tests.support.metadatos import (
    ENDPOINT_INVENTADO,
    MARCADOR_I_CT_1,
    MARCADOR_I_LIT_1,
    MARCADOR_I_LIT_2,
)


def _registro(montaje: Montaje, clave: str):
    return next(r for i, r in montaje.catalogo.documentos.items() if i.split("@")[0] == clave)


@pytest.mark.ac("US-118", 1)
def test_ingesta_fuente_estructurada_copia_criterios_sin_invocar_llm(montaje: Montaje) -> None:
    """[US-118 AC-1] Un ensayo con criterios de elegibilidad estructurados no invoca al LLM de metadatos."""
    reporte = montaje.ingerir()

    ensayo = _registro(montaje, "i-ct-1")
    assert ensayo.population_criteria["subtipo"] == "castracion_resistente"
    assert ensayo.population_criteria["estadio"] == "metastasico"
    assert ensayo.population_criteria["ecog"] == "0-1"
    assert ensayo.metadata_source == "fuente_estructurada"
    assert reporte.resultado_de("i-ct-1").metadata_source == "fuente_estructurada"
    assert montaje.llm_metadatos.invocaciones_de(MARCADOR_I_CT_1) == 0


@pytest.mark.ac("US-118", 2)
def test_ingesta_ilit1_metadatos_extraidos_y_verificados(montaje: Montaje) -> None:
    """[US-118 AC-2] Los metadatos de un ensayo descrito solo en texto se extraen y verifican."""
    montaje.ingerir()

    articulo = _registro(montaje, "i-lit-1")
    assert articulo.study_design == "eca"
    assert articulo.trial_phase == "III"
    assert articulo.sample_size == 500
    assert articulo.population_criteria["estadio"] == "I–III"
    assert articulo.population_criteria["biomarcadores"] == {"her2": "positivo"}
    assert articulo.metadata_source == "extraido_verificado"
    assert montaje.llm_metadatos.invocaciones_de(MARCADOR_I_LIT_1) == 1


@pytest.mark.ac("US-118", 3)
def test_ingesta_ilit1_endpoint_inventado_queda_null_y_resto_se_conserva(
    montaje: Montaje,
) -> None:
    """[US-118 AC-3] Un metadato que no pasa el NLI queda no disponible y los demás se conservan."""
    montaje.ingerir()

    articulo = _registro(montaje, "i-lit-1")
    assert articulo.primary_endpoint is None
    assert ENDPOINT_INVENTADO not in str(articulo)
    assert all(ENDPOINT_INVENTADO not in c.chunk_text for c in montaje.almacen.chunks.values())
    assert (articulo.study_design, articulo.trial_phase, articulo.sample_size) == (
        "eca",
        "III",
        500,
    )
    assert articulo.population_criteria["estadio"] == "I–III"


@pytest.mark.ac("US-118", 4)
def test_ingesta_ilit2_sin_poblacion_queda_no_disponible(montaje: Montaje) -> None:
    """[US-118 AC-4] Un documento sin datos de población en el texto deja cada criterio no disponible."""
    montaje.ingerir()

    articulo = _registro(montaje, "i-lit-2")
    assert {articulo.population_criteria[c] for c in CRITERIOS_DE_POBLACION} == {"no_disponible"}
    assert montaje.llm_metadatos.invocaciones_de(MARCADOR_I_LIT_2) == 1
    assert articulo.metadata_source == "extraido_verificado"
