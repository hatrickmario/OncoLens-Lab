"""Metadatos de la ingesta (US-118, L1D-117): aceptación de AC-1…AC-4 y AC-6 sobre FX-06c-b ampliada.

Integración: el ``IngestionPipelineService`` real con el ``MetadataExtractionService`` real; se fingen solo los bordes
(LLM de metadatos, NLI, embeddings). Reloj e ids congelados.
"""

from __future__ import annotations

import pytest

from tests.integration.corpus_ingestion.conftest import Montaje
from tests.support.metadatos import MARCADOR_I_CT_1


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
