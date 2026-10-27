"""Carga la semilla del corpus (US-059, L1D-115): raíz de composición del ``SeedCorpusLoader``.

    python -m app.scripts.load_seed_corpus

Lee el manifiesto de ``CORPUS_SEED_MANIFEST_PATH``, rechaza lo que no tiene licencia aceptada o viene de una fuente
excluida, embebe, inserta en ``corpus.corpus_document`` (rol ``rag_corpus``) y en ``corpus_chunks`` (Milvus) y publica un
``CorpusRelease`` si cambió el conjunto vigente. Imprime un reporte JSON en la salida estándar: solo identificadores,
resultados, motivos y recuentos; nunca contenido, URLs, credenciales ni mensajes de las excepciones.

Código de salida: 0 si todo documento quedó cargado, omitido o rechazado (un rechazo por licencia es resultado esperado);
1 si hubo un documento con error, la configuración es inválida o una dependencia obligatoria falló.

Con ``MODEL_PROVIDER=local`` (US-231b) embebe con el adapter real de US-231a y trocea contando TOKENS del tokenizer de
BGE-M3 (``CORPUS_CHUNK_SIZE`` y ``CORPUS_CHUNK_OVERLAP`` son tokens). Antes de abrir nada verifica ruta y SHA-256 de
todos los archivos que carga (modelo y tokenizer de embeddings); un fallo termina nombrando solo la variable.
Sin ``MODEL_PROVIDER=local`` no hay embedder: nunca se usa uno falso.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

import httpx
from pydantic import ValidationError
from pymilvus import MilvusClient

from app.application.ports import Clock
from app.application.seed_corpus.ports import PassageEmbedder
from app.application.seed_corpus.reporte import ReporteDeCarga
from app.application.seed_corpus.seed_corpus_loader import SeedCorpusLoader
from app.config.settings import (
    AjustesDeCorpus,
    CorpusDatabaseSettings,
    CorpusSeedSettings,
    MilvusSettings,
    Settings,
)
from app.domain.corpus_seed.admisibilidad import PoliticaDeLicencias
from app.domain.corpus_seed.chunking import Tokenizador
from app.infrastructure.catalog.conexion import componer_url, crear_motor
from app.infrastructure.catalog.corpus_document_repository import CorpusDocumentRepository
from app.infrastructure.clock.system_clock import RelojDelSistema
from app.infrastructure.fetch.descargador_https import DescargadorHttps
from app.infrastructure.fetch.fuente_de_texto import FuenteDeTextoDelManifiesto
from app.infrastructure.ids.uuid_id_generator import UuidIdGenerator
from app.infrastructure.milvus.repository import MilvusRepository
from app.infrastructure.models.verificacion import ModeloNoVerificadoError
from app.infrastructure.seed_manifest.lector import ManifiestoInvalido, leer_manifiesto
from app.infrastructure.tokenizer.de_archivo import TokenizadorDePiezas
from app.infrastructure.tokenizer.por_palabras import TokenizadorPorPalabras


def fabricar_embedder_real(ajustes: Settings, **fabricas: Any) -> PassageEmbedder:
    """El ``PassageEmbedder`` real de US-231a, con sus archivos verificados. Sin ``MODEL_PROVIDER=local`` falla
    nombrando la variable: jamás devuelve un embedder falso. ``fabricas`` inyecta sesión y tokenizer en los tests."""
    if ajustes.model_provider != "local":
        raise ModeloNoVerificadoError("MODEL_PROVIDER")
    from app.infrastructure.models.local import (
        cargar_embedder_de_pasajes,
    )  # difiere onnxruntime hasta que hace falta

    return cargar_embedder_de_pasajes(ajustes, **fabricas)


def fabricar_tokenizador_de_chunks(ajustes: Settings) -> TokenizadorDePiezas:
    """Tokenizer de BGE-M3 para contar tokens al trocear; su archivo ya lo verificó ``fabricar_embedder_real``."""
    try:
        return TokenizadorDePiezas(ajustes.embedding_tokenizer_path)  # type: ignore[arg-type]
    except Exception:  # noqa: BLE001 - el mensaje del runtime puede llevar la ruta
        raise ModeloNoVerificadoError("EMBEDDING_TOKENIZER_PATH") from None


def exigir_proveedor_de_modelos_local() -> None:
    """RN-12 por código: sin ``MODEL_PROVIDER=local`` falla nombrando la variable y nunca su valor."""
    try:
        proveedor = Settings(_env_file=None, modelos=None).model_provider  # type: ignore[call-arg]
    except ValidationError:
        raise ModeloNoVerificadoError("MODEL_PROVIDER") from None
    if proveedor != "local":
        raise ModeloNoVerificadoError("MODEL_PROVIDER")


def ajustes_de_modelos_del_entorno() -> Settings:
    """``Settings`` completos con ``MODEL_PROVIDER=local``. El proveedor se mira ANTES de exigir el bloque de ADR-39,
    para que un entorno sin modelos locales nombre ``MODEL_PROVIDER`` y no una clave de modelo."""
    exigir_proveedor_de_modelos_local()
    try:
        return Settings(_env_file=None)  # type: ignore[call-arg]
    except ValidationError as error:
        raise ModeloNoVerificadoError(_claves_invalidas(error) or "EMBEDDING_MODEL") from None


def allow_cc_by_nc_del_entorno() -> bool:
    """``ALLOW_CC_BY_NC`` por ``Settings`` (RN-21), la misma clave del cargador de datasets.

    ``modelos=None`` evita que Settings exija TODO el bloque de ADR-39 solo porque el entorno trae EMBEDDING_DIM o
    CORPUS_CHUNK_SIZE.
    """
    return Settings(_env_file=None, modelos=None).allow_cc_by_nc  # type: ignore[call-arg]


def politica_de_licencias(ajustes: AjustesDeCorpus, permitir_cc_by_nc: bool) -> PoliticaDeLicencias:
    return PoliticaDeLicencias(
        aceptadas=frozenset(ajustes.corpus_accepted_licenses),
        excluidas=ajustes.corpus_excluded_sources,
        mapa_de_clases=ajustes.corpus_license_class_map,
        permitir_cc_by_nc=permitir_cc_by_nc,
    )


def _fuente_de_texto(ajustes: CorpusSeedSettings) -> FuenteDeTextoDelManifiesto:
    return fuente_de_texto(ajustes, ajustes.corpus_seed_manifest_path.parent)


def fuente_de_texto(ajustes: AjustesDeCorpus, directorio_base: Path) -> FuenteDeTextoDelManifiesto:
    descargador = (
        DescargadorHttps(
            httpx.Client(timeout=ajustes.corpus_fetch_timeout_seconds, trust_env=False),
            ajustes.corpus_fetch_allowed_hosts,
            ajustes.corpus_fetch_max_bytes,
            ajustes.corpus_fetch_deadline_seconds,
        )
        if ajustes.corpus_fetch_allowed_hosts
        else None
    )
    return FuenteDeTextoDelManifiesto(directorio_base, descargador)


def _claves_invalidas(error: ValidationError) -> str:
    return ", ".join(sorted({str(e["loc"][0]).upper() for e in error.errors() if e["loc"]}))


def _ejecutar_carga(
    semilla: CorpusSeedSettings,
    milvus: MilvusSettings,
    base: CorpusDatabaseSettings,
    politica: PoliticaDeLicencias,
    embedder: PassageEmbedder,
    tokenizador: Tokenizador,
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
            tokenizador=tokenizador,
            tamano_de_chunk=semilla.corpus_chunk_size,
            solape_de_chunk=semilla.corpus_chunk_overlap,
            fecha_de_corte=semilla.corpus_cutoff_date,
        )
        return cargador.cargar(documentos)
    finally:
        motor.dispose()


def _modelos_de_la_semilla(
    embedder: PassageEmbedder | None, tokenizador: Tokenizador | None
) -> tuple[PassageEmbedder, Tokenizador]:
    """Embedder y tokenizer de chunks. Inyectados (solo en los tests) o, en producción, los reales y verificados:
    no hay bifurcación por proveedor dentro de ``fragmentar()``."""
    if embedder is not None:
        return embedder, tokenizador or TokenizadorPorPalabras()
    ajustes = ajustes_de_modelos_del_entorno()
    return fabricar_embedder_real(ajustes), fabricar_tokenizador_de_chunks(ajustes)


def main(
    embedder: PassageEmbedder | None = None,
    reloj: Clock | None = None,
    tokenizador: Tokenizador | None = None,
) -> int:
    """``embedder``, ``reloj`` y ``tokenizador`` se inyectan solo en los tests; en producción salen de los adapters
    reales (``MODEL_PROVIDER=local``)."""
    try:
        semilla = CorpusSeedSettings(_env_file=None)  # type: ignore[call-arg]
        milvus = MilvusSettings(_env_file=None)  # type: ignore[call-arg]
        base = CorpusDatabaseSettings(_env_file=None)  # type: ignore[call-arg]
        politica = politica_de_licencias(semilla, allow_cc_by_nc_del_entorno())
    except ValidationError as error:
        print(
            f"load_seed_corpus: configuración inválida en: {_claves_invalidas(error)}",
            file=sys.stderr,
        )
        return 1
    try:
        modelos_embedder, modelos_tokenizador = _modelos_de_la_semilla(embedder, tokenizador)
        reporte = _ejecutar_carga(
            semilla,
            milvus,
            base,
            politica,
            modelos_embedder,
            modelos_tokenizador,
            reloj or RelojDelSistema(),
        )
    except (ModeloNoVerificadoError, ManifiestoInvalido) as error:
        print(f"load_seed_corpus: {error}", file=sys.stderr)
        return 1
    except Exception as error:  # noqa: BLE001 - se informa la clase; el mensaje de la base o de pymilvus puede traer una URI
        print(f"load_seed_corpus: falló ({type(error).__name__})", file=sys.stderr)
        return 1
    print(json.dumps(reporte.como_diccionario(), ensure_ascii=False))
    return 1 if reporte.hubo_errores else 0


if __name__ == "__main__":
    sys.exit(main())
