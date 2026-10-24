"""Montaje de la ingesta (US-117a): el ``IngestionPipelineService`` real sobre catálogo y almacén en memoria.

Se fingen solo los bordes (PostgreSQL ``corpus``, Milvus, *embeddings*, *sparse*); el reloj y los ids van congelados. El
mismo servicio contra PostgreSQL y Milvus de test reales lo ejercita la CLI en ``tests/integration/corpus_store``.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import pytest

from app.application.corpus_ingestion.ingestion_pipeline_service import IngestionPipelineService
from app.application.corpus_ingestion.reporte import ReporteDeIngesta
from app.domain.corpus_seed.documento import DocumentoDeSemilla
from app.infrastructure.fetch.fuente_de_texto import FuenteDeTextoDelManifiesto
from app.infrastructure.seed_manifest.lector import leer_manifiesto
from app.infrastructure.tokenizer.por_palabras import TokenizadorPorPalabras
from tests.support.almacenes_falsos import AlmacenDeChunksEnMemoria, CatalogoEnMemoria
from tests.support.fakes import RelojFijo
from tests.support.ingesta import (
    MANIFIESTO_FX_06C_B,
    CodificadorSparseFalso,
    EmbedderInterrumpible,
)
from tests.support.semilla import (
    DIRECTORIO_DE_FIXTURES,
    FECHA_DE_CORTE_DE_TEST,
    SOLAPE_DE_CHUNK_DE_TEST,
    TAMANO_DE_CHUNK_DE_TEST,
    GeneradorDeIdsFijo,
    politica_de_test,
)


@dataclass
class Montaje:
    catalogo: CatalogoEnMemoria
    almacen: AlmacenDeChunksEnMemoria
    embedder: EmbedderInterrumpible
    sparse: CodificadorSparseFalso
    servicio: IngestionPipelineService
    directorio: Path

    def ingerir(self, manifiesto: Path | None = None) -> ReporteDeIngesta:
        return self.servicio.ingerir(self.documentos(manifiesto))

    def documentos(self, manifiesto: Path | None = None) -> tuple[DocumentoDeSemilla, ...]:
        return leer_manifiesto(manifiesto or MANIFIESTO_FX_06C_B)

    def chunks_por_clave(self) -> dict[str, int]:
        """Chunks en el almacén por ``document_key`` (el id del documento es ``<clave>@<checksum>``)."""
        cuenta: dict[str, int] = {}
        for chunk in self.almacen.chunks.values():
            clave = chunk.document_id.split("@")[0]
            cuenta[clave] = cuenta.get(clave, 0) + 1
        return cuenta

    def filas_por_clave(self, clave: str) -> list[str]:
        return [i for i in self.catalogo.documentos if i.split("@")[0] == clave]


def montar(directorio_de_textos: Path = DIRECTORIO_DE_FIXTURES) -> Montaje:
    catalogo, almacen = CatalogoEnMemoria(), AlmacenDeChunksEnMemoria()
    embedder, sparse = EmbedderInterrumpible(), CodificadorSparseFalso()
    servicio = IngestionPipelineService(
        catalogo=catalogo,
        almacen_de_chunks=almacen,
        embedder=embedder,
        codificador_sparse=sparse,
        fuente=FuenteDeTextoDelManifiesto(directorio_de_textos, None),
        reloj=RelojFijo(),
        ids=GeneradorDeIdsFijo(),
        politica=politica_de_test(),
        tokenizador=TokenizadorPorPalabras(),
        tamano_de_chunk=TAMANO_DE_CHUNK_DE_TEST,
        solape_de_chunk=SOLAPE_DE_CHUNK_DE_TEST,
        fecha_de_corte=FECHA_DE_CORTE_DE_TEST,
    )
    return Montaje(catalogo, almacen, embedder, sparse, servicio, directorio_de_textos)


@pytest.fixture
def montaje() -> Montaje:
    return montar()
