"""Carga la semilla del corpus (US-059, L1D-115): raíz de composición del ``SeedCorpusLoader``.

    python -m app.scripts.load_seed_corpus

Lee el manifiesto de ``CORPUS_SEED_MANIFEST_PATH``, rechaza lo que no tiene licencia aceptada o viene de una fuente
excluida, embebe, inserta en ``corpus.corpus_document`` (rol ``rag_corpus``) y en ``corpus_chunks`` (Milvus) y publica un
``CorpusRelease`` si cambió el conjunto vigente. Imprime un reporte JSON en la salida estándar: solo identificadores,
resultados, motivos y recuentos; nunca contenido, URLs, credenciales ni mensajes de las excepciones.

Código de salida: 0 si todo documento quedó cargado, omitido o rechazado (un rechazo por licencia es resultado esperado);
1 si hubo un documento con error, la configuración es inválida o una dependencia obligatoria falló.

El adapter real de *embeddings* (ADR-39) lo aporta L1D-106: hasta entonces la fábrica real falla con un mensaje claro.
"""

from __future__ import annotations

import json
import sys

import httpx
from pydantic import ValidationError
from pymilvus import MilvusClient

from app.application.ports import Clock
from app.application.seed_corpus.ports import PassageEmbedder
from app.application.seed_corpus.reporte import ReporteDeCarga
from app.application.seed_corpus.seed_corpus_loader import SeedCorpusLoader
from app.config.settings import (
    CorpusDatabaseSettings,
    CorpusSeedSettings,
    MilvusSettings,
    Settings,
)
from app.domain.corpus_seed.admisibilidad import PoliticaDeLicencias
from app.infrastructure.catalog.conexion import componer_url, crear_motor
from app.infrastructure.catalog.corpus_document_repository import CorpusDocumentRepository
from app.infrastructure.clock.system_clock import RelojDelSistema
from app.infrastructure.fetch.fuente_de_texto import FuenteDeTextoDelManifiesto
from app.infrastructure.fetch.descargador_https import DescargadorHttps
from app.infrastructure.ids.uuid_id_generator import UuidIdGenerator
from app.infrastructure.milvus.repository import MilvusRepository
from app.infrastructure.seed_manifest.lector import ManifiestoInvalido, leer_manifiesto
from app.infrastructure.tokenizer.por_palabras import TokenizadorPorPalabras


class AdapterDeEmbeddingsNoDisponible(RuntimeError):
    """El adapter real de ``PassageEmbedder`` (ADR-39) todavía no existe: lo aporta L1D-106."""


def fabricar_embedder_real(ajustes: MilvusSettings) -> PassageEmbedder:
    raise AdapterDeEmbeddingsNoDisponible(
        "el adapter real de embeddings (ADR-39) aún no existe: lo aporta L1D-106"
    )


def politica_de_licencias(ajustes: CorpusSeedSettings) -> PoliticaDeLicencias:
    # ``modelos=None`` evita que Settings exija TODO el bloque de ADR-39 solo porque el entorno trae EMBEDDING_DIM o
    # CORPUS_CHUNK_SIZE: aquí solo se lee ``ALLOW_CC_BY_NC``, la misma clave que usa el cargador de datasets (RN-21).
    permitir_cc_by_nc = Settings(_env_file=None, modelos=None).allow_cc_by_nc  # type: ignore[call-arg]
    return PoliticaDeLicencias(
        aceptadas=frozenset(ajustes.corpus_accepted_licenses),
        excluidas=ajustes.corpus_excluded_sources,
        mapa_de_clases=ajustes.corpus_license_class_map,
        permitir_cc_by_nc=permitir_cc_by_nc,
    )


def _fuente_de_texto(ajustes: CorpusSeedSettings) -> FuenteDeTextoDelManifiesto:
    descargador = (
        DescargadorHttps(
            httpx.Client(timeout=ajustes.corpus_fetch_timeout_seconds),
            ajustes.corpus_fetch_allowed_hosts,
            ajustes.corpus_fetch_max_bytes,
            ajustes.corpus_fetch_deadline_seconds,
        )
        if ajustes.corpus_fetch_allowed_hosts
        else None
    )
    return FuenteDeTextoDelManifiesto(ajustes.corpus_seed_manifest_path.parent, descargador)


def _claves_invalidas(error: ValidationError) -> str:
    return ", ".join(sorted({str(e["loc"][0]).upper() for e in error.errors() if e["loc"]}))


def _ejecutar_carga(
    semilla: CorpusSeedSettings,
    milvus: MilvusSettings,
    base: CorpusDatabaseSettings,
    politica: PoliticaDeLicencias,
    embedder: PassageEmbedder,
    reloj: Clock,
) -> ReporteDeCarga:
    """Raíz de composición: adapters reales -> ``SeedCorpusLoader``. Cierra las conexiones a PostgreSQL al terminar."""
    documentos = leer_manifiesto(semilla.corpus_seed_manifest_path)
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
        cargador = SeedCorpusLoader(
            catalogo=CorpusDocumentRepository(motor),
            almacen_de_chunks=almacen,
            embedder=embedder,
            fuente=_fuente_de_texto(semilla),
            reloj=reloj,
            ids=UuidIdGenerator("release"),
            politica=politica,
            tokenizador=TokenizadorPorPalabras(),
            tamano_de_chunk=semilla.corpus_chunk_size,
            solape_de_chunk=semilla.corpus_chunk_overlap,
            fecha_de_corte=semilla.corpus_cutoff_date,
        )
        return cargador.cargar(documentos)
    finally:
        motor.dispose()


def main(embedder: PassageEmbedder | None = None, reloj: Clock | None = None) -> int:
    """``embedder`` y ``reloj`` se inyectan solo en los tests; en producción salen de los adapters reales."""
    try:
        semilla = CorpusSeedSettings(_env_file=None)  # type: ignore[call-arg]
        milvus = MilvusSettings(_env_file=None)  # type: ignore[call-arg]
        base = CorpusDatabaseSettings(_env_file=None)  # type: ignore[call-arg]
        politica = politica_de_licencias(semilla)
    except ValidationError as error:
        print(
            f"load_seed_corpus: configuración inválida en: {_claves_invalidas(error)}",
            file=sys.stderr,
        )
        return 1
    try:
        reporte = _ejecutar_carga(
            semilla,
            milvus,
            base,
            politica,
            embedder or fabricar_embedder_real(milvus),
            reloj or RelojDelSistema(),
        )
    except (AdapterDeEmbeddingsNoDisponible, ManifiestoInvalido) as error:
        print(f"load_seed_corpus: {error}", file=sys.stderr)
        return 1
    except Exception as error:  # noqa: BLE001 - se informa la clase; el mensaje de la base o de pymilvus puede traer una URI
        print(f"load_seed_corpus: falló ({type(error).__name__})", file=sys.stderr)
        return 1
    print(json.dumps(reporte.como_diccionario(), ensure_ascii=False))
    return 1 if reporte.hubo_errores else 0


if __name__ == "__main__":
    sys.exit(main())
