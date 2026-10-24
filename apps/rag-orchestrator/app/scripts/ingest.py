"""Ingesta en lote reanudable del corpus (US-117a, L1D-116): raíz de composición del ``IngestionPipelineService``.

    python -m app.scripts.ingest --manifest <ruta>

Lee el manifiesto indicado, rechaza lo que no tiene licencia aceptada o viene de una fuente excluida (RN-21), normaliza,
trocea, embebe *dense* y *sparse*, inserta en ``corpus.corpus_document`` (rol ``rag_corpus``) y en ``corpus_chunks``
(Milvus) y publica un ``CorpusRelease`` si cambió el conjunto vigente. Es reanudable: el avance de cada documento queda
en el catálogo (``status`` y ``checksum``), así que relanzarla solo procesa lo que no llegó a ``embebido``.

Imprime un resumen JSON en la salida estándar: solo identificadores, estados, motivos (etapa y clase) y contadores;
nunca contenido, URLs, credenciales ni mensajes de excepción.

Código de salida: 0 si ningún documento quedó en ``error``; 1 si hubo uno, la configuración es inválida o una
dependencia obligatoria falló. Como ``load_seed_corpus``: sin ``MODEL_PROVIDER=local`` no hay embedder, y nunca se usa
uno falso fuera de los tests.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Sequence
from pathlib import Path

from pydantic import ValidationError
from pymilvus import MilvusClient

from app.application.corpus_ingestion.ingestion_pipeline_service import IngestionPipelineService
from app.application.corpus_ingestion.ports import SparsePassageEncoder
from app.application.corpus_ingestion.reporte import ReporteDeIngesta
from app.application.ports import Clock
from app.application.seed_corpus.ports import PassageEmbedder
from app.config.settings import (
    CorpusDatabaseSettings,
    CorpusIngestSettings,
    MilvusSettings,
)
from app.domain.corpus_seed.admisibilidad import PoliticaDeLicencias
from app.domain.corpus_seed.chunking import Tokenizador
from app.infrastructure.catalog.conexion import componer_url, crear_motor
from app.infrastructure.catalog.corpus_document_repository import CorpusDocumentRepository
from app.infrastructure.clock.system_clock import RelojDelSistema
from app.infrastructure.ids.uuid_id_generator import UuidIdGenerator
from app.infrastructure.milvus.repository import MilvusRepository
from app.infrastructure.models.verificacion import ModeloNoVerificadoError
from app.infrastructure.seed_manifest.lector import ManifiestoInvalido, leer_manifiesto
from app.infrastructure.tokenizer.por_palabras import TokenizadorPorPalabras
from app.scripts.load_seed_corpus import (
    ajustes_de_modelos_del_entorno,
    allow_cc_by_nc_del_entorno,
    fabricar_tokenizador_de_chunks,
    fuente_de_texto,
    politica_de_licencias,
)

NOMBRE = "ingest"


def _claves_invalidas(error: ValidationError) -> str:
    return ", ".join(sorted({str(e["loc"][0]).upper() for e in error.errors() if e["loc"]}))


def fabricar_codificadores_reales(
    ajustes: CorpusIngestSettings,
) -> tuple[PassageEmbedder, SparsePassageEncoder, Tokenizador]:
    """Embedder dense, codificador *sparse* y tokenizer de chunks REALES, con todos sus archivos verificados.

    Sin ``MODEL_PROVIDER=local`` falla nombrando la variable: jamás devuelve un doble. El ``onnxruntime`` se difiere
    hasta aquí para que la validación de configuración no lo importe.
    """
    from app.infrastructure.models.local import cargar_embeddings_y_sparse_de_pasajes

    modelos = ajustes_de_modelos_del_entorno()
    embedder, sparse = cargar_embeddings_y_sparse_de_pasajes(modelos, ajustes)
    return embedder, sparse, fabricar_tokenizador_de_chunks(modelos)


def _ejecutar_ingesta(
    manifiesto: Path,
    ajustes: CorpusIngestSettings,
    milvus: MilvusSettings,
    base: CorpusDatabaseSettings,
    politica: PoliticaDeLicencias,
    embedder: PassageEmbedder,
    sparse: SparsePassageEncoder,
    tokenizador: Tokenizador,
    reloj: Clock,
) -> ReporteDeIngesta:
    """Raíz de composición: adapters reales -> ``IngestionPipelineService``. Cierra las conexiones a PostgreSQL al terminar."""
    documentos = leer_manifiesto(manifiesto)
    motor = crear_motor(
        componer_url(
            base.corpus_database_url,
            base.pg_rag_corpus_password_file,
            "PG_RAG_CORPUS_PASSWORD_FILE",
        )
    )
    try:
        almacen = MilvusRepository(MilvusClient(uri=milvus.milvus_uri), milvus)
        almacen.ensure_collection()
        servicio = IngestionPipelineService(
            catalogo=CorpusDocumentRepository(motor),
            almacen_de_chunks=almacen,
            embedder=embedder,
            codificador_sparse=sparse,
            fuente=fuente_de_texto(ajustes, manifiesto.resolve().parent),
            reloj=reloj,
            ids=UuidIdGenerator("release"),
            politica=politica,
            tokenizador=tokenizador,
            tamano_de_chunk=ajustes.corpus_chunk_size,
            solape_de_chunk=ajustes.corpus_chunk_overlap,
            fecha_de_corte=ajustes.corpus_cutoff_date,
        )
        return servicio.ingerir(documentos)
    finally:
        motor.dispose()


def _modelos_de_la_ingesta(
    ajustes: CorpusIngestSettings,
    embedder: PassageEmbedder | None,
    sparse: SparsePassageEncoder | None,
    tokenizador: Tokenizador | None,
) -> tuple[PassageEmbedder, SparsePassageEncoder, Tokenizador]:
    """Inyectados (solo en los tests) o, en producción, los reales y verificados."""
    if embedder is not None and sparse is not None:
        return embedder, sparse, tokenizador or TokenizadorPorPalabras()
    return fabricar_codificadores_reales(ajustes)


def _argumentos(argv: Sequence[str] | None) -> argparse.Namespace:
    analizador = argparse.ArgumentParser(prog="python -m app.scripts.ingest", description=__doc__)
    analizador.add_argument("--manifest", type=Path, required=True, help="manifiesto de ingesta")
    return analizador.parse_args(argv)


def main(
    argv: Sequence[str] | None = None,
    embedder: PassageEmbedder | None = None,
    sparse: SparsePassageEncoder | None = None,
    reloj: Clock | None = None,
    tokenizador: Tokenizador | None = None,
) -> int:
    """``embedder``, ``sparse``, ``reloj`` y ``tokenizador`` se inyectan solo en los tests; en producción salen de los
    adapters reales (``MODEL_PROVIDER=local``)."""
    argumentos = _argumentos(argv)
    try:
        ajustes = CorpusIngestSettings(_env_file=None)  # type: ignore[call-arg]
        milvus = MilvusSettings(_env_file=None)  # type: ignore[call-arg]
        base = CorpusDatabaseSettings(_env_file=None)  # type: ignore[call-arg]
        politica = politica_de_licencias(ajustes, allow_cc_by_nc_del_entorno())
    except ValidationError as error:
        print(f"{NOMBRE}: configuración inválida en: {_claves_invalidas(error)}", file=sys.stderr)
        return 1
    try:
        modelos = _modelos_de_la_ingesta(ajustes, embedder, sparse, tokenizador)
        reporte = _ejecutar_ingesta(
            argumentos.manifest,
            ajustes,
            milvus,
            base,
            politica,
            *modelos,
            reloj or RelojDelSistema(),
        )
    except (ModeloNoVerificadoError, ManifiestoInvalido) as error:
        print(f"{NOMBRE}: {error}", file=sys.stderr)
        return 1
    except Exception as error:  # noqa: BLE001 - se informa la clase; el mensaje de la base o de pymilvus puede traer una URI
        print(f"{NOMBRE}: falló ({type(error).__name__})", file=sys.stderr)
        return 1
    print(json.dumps(reporte.como_diccionario(), ensure_ascii=False))
    return 1 if reporte.hubo_errores else 0


if __name__ == "__main__":
    sys.exit(main())
