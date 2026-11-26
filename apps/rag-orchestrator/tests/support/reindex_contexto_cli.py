"""Adapters falsos de ``ingest reindex-context`` para los tests de la CLI (US-279, L1D-337) y su lanzador de proceso.

Un origen con 2 chunks vigentes y 1 no vigente de un documento del catálogo, un destino vacío y un catálogo de solo lectura: todo en
memoria, con el contrato de los puertos reales. ``python -m tests.support.reindex_contexto_cli`` ejecuta ``ingest.main`` en un proceso
aparte con esos adapters (el humo del subcomando real: configuración por entorno, código de salida y salida estándar).
"""

from __future__ import annotations

import sys
from dataclasses import replace

from app.application.ports import ChunkDelCorpus
from app.application.seed_corpus.ports import RegistroDeDocumento
from app.scripts import ingest
from tests.support.almacenes_falsos import AlmacenDeChunksEnMemoria, CatalogoEnMemoria
from tests.support.fakes import RelojFijo
from tests.support.ingesta import CodificadorSparseFalso
from tests.support.registros import registro_de_prueba
from tests.support.semilla import EmbedderFalso

DOCUMENTO = "doc-a@abcdef"
TEXTO_SECRETO_DEL_CHUNK = "Texto sintético del chunk que no debe salir en el resumen"
TEXTOS = (
    f"{TEXTO_SECRETO_DEL_CHUNK} uno.",
    f"{TEXTO_SECRETO_DEL_CHUNK} dos.",
    f"{TEXTO_SECRETO_DEL_CHUNK} antiguo.",
)


def _chunk(indice: int, texto: str, *, vigente: bool) -> ChunkDelCorpus:
    return ChunkDelCorpus(
        chunk_id=f"{DOCUMENTO}#{indice:04d}",
        document_id=DOCUMENTO,
        dense_vector=[0.5] * 8,
        chunk_text=texto,
        chunk_index=indice,
        section="texto_completo",
        source_type="guideline",
        language="es",
        cancer_type_tags="mama",
        population="adulto",
        study_design="guia",
        published_year=2025,
        is_current=vigente,
        created_at_ms=1_760_000_000_000,
        sparse_vector={1: 0.5},
    )


def origen_de_prueba() -> AlmacenDeChunksEnMemoria:
    almacen = AlmacenDeChunksEnMemoria()
    almacen.upsert_chunks(
        [
            _chunk(0, TEXTOS[0], vigente=True),
            _chunk(1, TEXTOS[1], vigente=True),
            _chunk(2, TEXTOS[2], vigente=False),
        ]
    )
    return almacen


def catalogo_de_prueba() -> CatalogoEnMemoria:
    catalogo = CatalogoEnMemoria()
    registro: RegistroDeDocumento = replace(registro_de_prueba(DOCUMENTO), title="Guía de prueba")
    catalogo.guardar_documento(registro)
    return catalogo


def puertos() -> ingest.PuertosDeLaReindexacionDeContexto:
    return ingest.PuertosDeLaReindexacionDeContexto(
        origen=origen_de_prueba(),
        destino=AlmacenDeChunksEnMemoria(),
        catalogo=catalogo_de_prueba(),
    )


if __name__ == "__main__":
    sys.exit(
        ingest.main(
            sys.argv[1:],
            embedder=EmbedderFalso(),
            sparse=CodificadorSparseFalso(),
            reloj=RelojFijo(),
            puertos_contexto=puertos(),
        )
    )
