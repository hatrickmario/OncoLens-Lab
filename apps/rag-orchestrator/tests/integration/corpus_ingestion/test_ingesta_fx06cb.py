"""Ingesta en lote FX-06c-b (US-117a, L1D-116): aceptación de AC-1 sobre catálogo y almacén en memoria.

Embeddings dense y sparse falsos deterministas con ``EMBEDDING_DIM = 8``; reloj e ids congelados.
"""

from __future__ import annotations

import pytest

from app.application.corpus_ingestion.reporte import Estado
from app.domain.corpus_seed.poblacion import CRITERIOS_DE_POBLACION
from tests.integration.corpus_ingestion.conftest import Montaje
from tests.support.ingesta import DOCUMENTOS_ADMISIBLES_FX_06C_B
from tests.support.milvus import DIMENSION_DE_TEST


def _registro(montaje: Montaje, clave: str):
    return next(r for i, r in montaje.catalogo.documentos.items() if i.split("@")[0] == clave)


@pytest.mark.ac("US-117a", 1)
def test_ingesta_fx06cb_documentos_admisibles_quedan_embebidos_con_dense_y_sparse(
    montaje: Montaje,
) -> None:
    """[US-117a AC-1] Los documentos admisibles de FX-06c-b quedan embebidos con dense y sparse."""
    montaje.ingerir()

    for clave in DOCUMENTOS_ADMISIBLES_FX_06C_B:
        registro = _registro(montaje, clave)
        assert registro.status == "embebido" and registro.is_current, clave
        chunks = [
            c for c in montaje.almacen.chunks.values() if c.document_id == registro.document_id
        ]
        assert chunks, clave
        for chunk in chunks:
            assert len(chunk.dense_vector) == DIMENSION_DE_TEST
            assert chunk.sparse_vector is not None and len(chunk.sparse_vector) >= 1
            assert chunk.is_current
            assert (chunk.source_type, chunk.language, chunk.cancer_type_tags) == (
                registro.source_type,
                registro.language,
                registro.cancer_type_tags,
            )
            assert (chunk.population, chunk.study_design, chunk.published_year) == (
                registro.population,
                registro.study_design,
                registro.published_at.year,
            )


@pytest.mark.ac("US-117a", 1)
def test_ingesta_fx06cb_copia_criterios_estructurados_y_deja_el_resto_no_disponible(
    montaje: Montaje,
) -> None:
    """[US-117a AC-1] Los criterios de población estructurados se copian y el resto queda no disponible."""
    montaje.ingerir()

    ensayo, articulo = _registro(montaje, "i-ct-1"), _registro(montaje, "i-lit-2")
    assert ensayo.population_criteria["estadio"] == "metastasico"
    assert ensayo.population_criteria["linea"] == "primera"
    assert ensayo.metadata_source == "fuente_estructurada"
    assert {articulo.population_criteria[c] for c in CRITERIOS_DE_POBLACION} == {"no_disponible"}


def test_ingesta_fx06cb_resume_cada_documento_con_su_estado(montaje: Montaje) -> None:
    reporte = montaje.ingerir()

    assert {r.document_key: r.estado for r in reporte.resultados} == {
        "i-ct-1": Estado.EMBEBIDO,
        "i-lit-1": Estado.EMBEBIDO,
        "i-lit-2": Estado.EMBEBIDO,
        "i-gl-1": Estado.EMBEBIDO,
        "i-nd": Estado.RECHAZADO_LICENCIA,
        "i-esmo": Estado.RECHAZADO_LICENCIA,
    }
