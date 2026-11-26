"""Ingesta en lote reanudable del corpus (US-117a, L1D-116): raíz de composición del ``IngestionPipelineService``.

    python -m app.scripts.ingest --manifest <ruta>
    python -m app.scripts.ingest reindex-sparse

Lee el manifiesto indicado, rechaza lo que no tiene licencia aceptada o viene de una fuente excluida (RN-21), normaliza,
trocea, embebe *dense* y *sparse*, inserta en ``corpus.corpus_document`` (rol ``rag_corpus``) y en ``corpus_chunks``
(Milvus) y publica un ``CorpusRelease`` si cambió el conjunto vigente. Es reanudable: el avance de cada documento queda
en el catálogo (``status`` y ``checksum``), así que relanzarla solo procesa lo que no llegó a ``embebido``.

Paso de metadatos (US-118): un documento sin metadatos estructurados pasa por el LLM LOCAL (``LLM_BASE_URL``, RN-12) y se
verifica con el NLI (``NLI_ENTAILMENT_THRESHOLD``); si cualquiera cae, el documento se indexa igual con
``metadata_source = pendiente``. Al publicar una release se escribe la muestra para revisión humana en
``CORPUS_METADATA_SAMPLE_DIR`` (``CORPUS_METADATA_SAMPLE_PCT``, ``CORPUS_METADATA_SAMPLE_SEED``).

Imprime un resumen JSON en la salida estándar: solo identificadores, estados, motivos (etapa y clase) y contadores;
nunca contenido, URLs, credenciales ni mensajes de excepción.

``brazo-de-chunks`` (US-278, ``[S7 resp. 14]``) ingiere los mismos documentos del manifiesto con chunks de ``--tamano`` tokens en una
colección de Milvus PROPIA (``--coleccion``): el catálogo ``corpus`` se lee y no se escribe, la colección de ``MILVUS_COLLECTION_NAME``
no se toca (RN-05; si ``--coleccion`` es esa, se niega) y no hay LLM. Solo entran los documentos que la ingesta de origen dejó vigentes.

``reindex-sparse`` (US-117b) puebla el ``sparse_vector`` de los chunks VIGENTES de la semilla (``chunk_id``, ``dense_vector`` y los
demás campos no cambian; los no vigentes no se tocan). No usa LLM ni el catálogo (solo Milvus), así que no lleva la guarda de LLM
de ``ingest``, pero exige por código embeddings locales verificados por SHA-256 (``MODEL_PROVIDER=local``, ``EMBEDDING_*``,
``EMBEDDING_SPARSE_WEIGHTS_*``, RN-12) y falla cerrado nombrando solo la variable. El lote es ``CORPUS_SPARSE_REINDEX_BATCH_SIZE``.
Es idempotente y no se ejecuta a la vez que una ingesta. Falla con la etapa (``leer_vigentes|codificar|reescribir``) y la clase del error.

Código de salida: 0 si ningún documento quedó en ``error``; 1 si hubo uno, la configuración es inválida o una
dependencia obligatoria falló. Como ``load_seed_corpus``: sin ``MODEL_PROVIDER=local`` no hay embedder, y nunca se usa
uno falso fuera de los tests.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from pydantic import ValidationError
from pymilvus import MilvusClient

from app.application.corpus_ingestion.brazo_de_chunks import IngerirBrazoDeChunks
from app.application.corpus_ingestion.constructores_de_contexto import constructor_de_contexto
from app.application.corpus_ingestion.contexto_llm import GeneradorLlmDeContexto
from app.application.corpus_ingestion.ingestion_pipeline_service import IngestionPipelineService
from app.application.corpus_ingestion.ports import (
    AlmacenDeReindexacionDeContexto,
    AlmacenDeReindexacionSparse,
    ConstructorDeContexto,
    SparsePassageEncoder,
)
from app.application.corpus_ingestion.reindexar_contexto import (
    ETAPA_ESCRIBIR,
    ETAPA_LEER_ORIGEN,
    ReindexarContexto,
)
from app.application.corpus_ingestion.reindexar_sparse import (
    ETAPA_LEER,
    FalloDeReindexacion,
    ReindexarSparse,
    etapa_de_reindexacion,
)
from app.application.corpus_ingestion.reporte import ReporteDeIngesta
from app.application.corpus_ingestion.resumen_corpus import contar_corpus_por_tipo_y_fuente
from app.application.corpus_metadata.esquema import PROMPT_VERSION
from app.application.corpus_metadata.esquema_poblacion import PlantillaDePoblacionNoDisponible
from app.application.corpus_metadata.metadata_extraction_service import MetadataExtractionService
from app.application.corpus_metadata.muestra_de_metadatos import GeneradorDeMuestraDeMetadatos
from app.application.corpus_metadata.poblacion_puertos import LlmDePoblacion
from app.application.corpus_metadata.population_fanout import PopulationFanoutExtractor
from app.application.ports import Clock, LlmClient, NliClassifier
from app.application.seed_corpus.ports import (
    ChunkStoreDeIngesta,
    LectorDePoblacionDelCorpus,
    PassageEmbedder,
    SourceFetcher,
)
from app.config.settings import (
    AjustesDeContextoLlm,
    AjustesDeReindexacionDeContexto,
    AjustesDeReindexacionSparse,
    AjustesSparse,
    CorpusDatabaseSettings,
    CorpusIngestSettings,
    MilvusSettings,
    Settings,
)
from app.domain.corpus_seed.admisibilidad import PoliticaDeLicencias
from app.domain.corpus_seed.chunking import Tokenizador
from app.domain.corpus_seed.coleccion_de_la_variante import (
    ColeccionNoCorrespondeALaVariante,
    OrigenIgualAlDestino,
    exigir_coleccion_de_la_variante,
    exigir_origen_distinto_del_destino,
)
from app.domain.corpus_seed.contexto_del_chunk import VERSION_DE_LA_PLANTILLA, VarianteDeContexto
from app.domain.reglas_proveedor import variable_que_incumple_llm_local
from app.infrastructure.catalog.conexion import componer_url, crear_motor
from app.infrastructure.catalog.corpus_document_repository import CorpusDocumentRepository
from app.infrastructure.clock.system_clock import RelojDelSistema
from app.infrastructure.corpus_metadata.escritor_muestra import EscritorDeMuestraYaml
from app.infrastructure.ids.uuid_id_generator import UuidIdGenerator
from app.infrastructure.llm.openai_compatible import OpenAICompatibleLlmClient
from app.infrastructure.milvus.repository import MilvusRepository
from app.infrastructure.models.verificacion import ModeloNoVerificadoError
from app.infrastructure.seed_manifest.lector import ManifiestoInvalido, leer_manifiesto
from app.infrastructure.tokenizer.por_palabras import TokenizadorPorPalabras
from app.scripts.ingest_poblacion import (
    CatalogoDePoblacionNoConfigurado,
    extractor_de_poblacion,
    resumen_de_poblacion_del_corpus,
)
from app.scripts.load_seed_corpus import (
    ajustes_de_modelos_del_entorno,
    allow_cc_by_nc_del_entorno,
    exigir_proveedor_de_modelos_local,
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


@dataclass(frozen=True)
class ModelosDeMetadatos:
    """LLM local y NLI del paso de metadatos, con el umbral de soporte (``NLI_ENTAILMENT_THRESHOLD``, RN-22)."""

    llm: LlmClient
    nli: NliClassifier
    umbral_nli: float
    nombre_del_llm: str
    # LLM de la extracción de población en abanico (US-242). ``None`` = sin abanico: la población sigue por el camino de
    # US-118 (solo los tests que inyectan un ``llm`` de metadatos sin tarea corta).
    llm_poblacion: LlmDePoblacion | None = None


def _modelos_de_metadatos(
    llm: LlmClient | None,
    nli: NliClassifier | None,
    temperatura: float,
    llm_poblacion: LlmDePoblacion | None = None,
) -> ModelosDeMetadatos:
    """Inyectados (solo en los tests) o, en producción, el LLM local (RN-12) y el NLI real verificado. En producción el
    mismo cliente local atiende los metadatos escalares y la tarea corta de población.

    Sin ``NLI_ENTAILMENT_THRESHOLD`` no hay umbral que aplicar: falla nombrando la variable (RN-22).
    """
    ambiente = Settings(_env_file=None, modelos=None)  # type: ignore[call-arg]
    if ambiente.nli_entailment_threshold is None:
        raise ModeloNoVerificadoError("NLI_ENTAILMENT_THRESHOLD")
    if llm is None:
        cliente_local = _llm_local(ambiente, temperatura)
        llm_de_metadatos: LlmClient = cliente_local
        llm_de_poblacion: LlmDePoblacion | None = llm_poblacion or cliente_local
    else:
        llm_de_metadatos, llm_de_poblacion = llm, llm_poblacion
    return ModelosDeMetadatos(
        llm=llm_de_metadatos,
        nli=nli or _nli_real(),
        umbral_nli=ambiente.nli_entailment_threshold,
        nombre_del_llm=ambiente.llm_model or "no_declarado",
        llm_poblacion=llm_de_poblacion,
    )


class ConfiguracionDeLlmNoLocalError(RuntimeError):
    """La configuración admite un LLM que no es el local (RN-12). El mensaje es solo el NOMBRE de la variable."""

    def __init__(self, variable: str) -> None:
        super().__init__(variable)
        self.variable = variable


def _exigir_llm_local() -> None:
    """RN-12 por código: la CLI falla en cerrado (nombrando solo la variable, nunca su valor) si la configuración admite un
    LLM que no es el local. Decidido (usuario, 2026-10-24); la regla vive en el dominio."""
    ambiente = Settings(_env_file=None, modelos=None)  # type: ignore[call-arg]
    incumplida = variable_que_incumple_llm_local(
        llm_cloud_enabled=ambiente.llm_cloud_enabled,
        llm_provider=ambiente.llm_provider,
        llm_base_url=ambiente.llm_base_url,
        llm_model=ambiente.llm_model,
    )
    if incumplida is not None:
        raise ConfiguracionDeLlmNoLocalError(incumplida)


def servicio_de_metadatos(modelos: ModelosDeMetadatos) -> MetadataExtractionService:
    """Fábrica de producción del paso de metadatos: la usan la CLI y la evaluación (adapters falsos en la CI)."""
    return MetadataExtractionService(
        llm=modelos.llm, nli=modelos.nli, umbral_nli=modelos.umbral_nli
    )


def servicio_de_metadatos_solo_escalares(modelos: ModelosDeMetadatos) -> MetadataExtractionService:
    """Como ``servicio_de_metadatos`` pero sin pedir población: la extrae el abanico (US-242 D8)."""
    return MetadataExtractionService.solo_escalares(
        llm=modelos.llm, nli=modelos.nli, umbral_nli=modelos.umbral_nli
    )


def _extractor_de_poblacion(
    modelos: ModelosDeMetadatos, ajustes: CorpusIngestSettings
) -> PopulationFanoutExtractor | None:
    """El abanico solo corre si hay LLM de población (producción o inyectado); sin él, el camino de US-118."""
    if modelos.llm_poblacion is None:
        return None
    ambiente = Settings(_env_file=None, modelos=None)  # type: ignore[call-arg]
    return extractor_de_poblacion(
        modelos.llm_poblacion,
        modelos.nli,
        modelos.umbral_nli,
        modelos.nombre_del_llm,
        ajustes,
        ambiente,
    )


def _llm_local(ambiente: Settings, temperatura: float) -> OpenAICompatibleLlmClient:
    return OpenAICompatibleLlmClient(
        ambiente.llm_base_url,
        ambiente.llm_model,
        ambiente.llm_request_timeout_ms,
        ambiente.llm_max_output_tokens,
        temperatura,
    )


def _nli_real() -> NliClassifier:
    """El ``onnxruntime`` se difiere hasta aquí, como los codificadores: la validación de configuración no lo importa."""
    from app.infrastructure.models.local import cargar_clasificador_nli

    return cargar_clasificador_nli(ajustes_de_modelos_del_entorno())


def escribir_muestra(
    generador: GeneradorDeMuestraDeMetadatos,
    release_id: str | None,
) -> dict[str, object]:
    """La muestra se escribe DESPUÉS de confirmar la ingesta: su fallo (solo la clase, nunca el mensaje) va al resumen y no
    tumba un reporte que ya describe documentos indexados."""
    try:
        return {"tamano": generador.generar(release_id).tamano}
    except Exception as error:  # noqa: BLE001 - E/S del archivo: se informa la clase
        return {"tamano": 0, "fallo": type(error).__name__}


def _ejecutar_ingesta(
    manifiesto: Path,
    ajustes: CorpusIngestSettings,
    milvus: MilvusSettings,
    base: CorpusDatabaseSettings,
    politica: PoliticaDeLicencias,
    embedder: PassageEmbedder,
    sparse: SparsePassageEncoder,
    tokenizador: Tokenizador,
    metadatos: ModelosDeMetadatos,
    reloj: Clock,
    constructor_de_contexto: ConstructorDeContexto,
) -> tuple[ReporteDeIngesta, dict[str, object], dict[str, Any] | None, dict[str, dict[str, int]]]:
    """Raíz de composición: adapters reales -> ``IngestionPipelineService``. Cierra las conexiones a PostgreSQL al terminar.

    Devuelve el reporte, la muestra de metadatos y, si corrió la extracción en abanico, el resumen de población por tipo de
    cáncer e idioma (US-120 AC-7)."""
    documentos = leer_manifiesto(manifiesto)
    extractor = _extractor_de_poblacion(
        metadatos, ajustes
    )  # antes de abrir conexiones: falla cerrado por configuración
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
        catalogo = CorpusDocumentRepository(motor)
        servicio = IngestionPipelineService(
            catalogo=catalogo,
            almacen_de_chunks=almacen,
            embedder=embedder,
            codificador_sparse=sparse,
            resolutor_de_metadatos=(
                servicio_de_metadatos(metadatos)
                if extractor is None
                else servicio_de_metadatos_solo_escalares(metadatos)
            ),
            fuente=fuente_de_texto(ajustes, manifiesto.resolve().parent),
            reloj=reloj,
            ids=UuidIdGenerator("release"),
            politica=politica,
            tokenizador=tokenizador,
            tamano_de_chunk=ajustes.corpus_chunk_size,
            solape_de_chunk=ajustes.corpus_chunk_overlap,
            fecha_de_corte=ajustes.corpus_cutoff_date,
            extractor_de_poblacion=extractor,
            almacen_de_poblacion=catalogo,
            constructor_de_contexto=constructor_de_contexto,
        )
        reporte = servicio.ingerir(documentos)
        generador = GeneradorDeMuestraDeMetadatos(
            pct=ajustes.corpus_metadata_sample_pct,
            semilla=ajustes.corpus_metadata_sample_seed,
            escritor=EscritorDeMuestraYaml(ajustes.corpus_metadata_sample_dir),
            catalogo=catalogo,
            reloj=reloj,
            prompt_version=PROMPT_VERSION,
            llm_model=metadatos.nombre_del_llm,
            nli_model=metadatos.nli.version,
        )
        poblacion = (
            None
            if extractor is None
            else resumen_de_poblacion_del_corpus(
                catalogo,
                ajustes,
                Settings(_env_file=None, modelos=None),  # type: ignore[call-arg]
            )
        )
        corpus = contar_corpus_por_tipo_y_fuente(catalogo.documentos_vigentes_con_poblacion())
        return reporte, escribir_muestra(generador, reporte.release_id), poblacion, corpus
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


MODO_REINDEX_SPARSE = "reindex-sparse"
MODO_BRAZO_DE_CHUNKS = "brazo-de-chunks"
MODO_REINDEX_CONTEXTO = "reindex-context"


def _argumentos(argv: Sequence[str] | None) -> argparse.Namespace:
    """Sin modo rige ``ingest``: ``--manifest`` obligatorio (validado a mano). ``reindex-sparse`` no acepta ``--manifest``."""
    analizador = argparse.ArgumentParser(prog="python -m app.scripts.ingest", description=__doc__)
    analizador.add_argument("--manifest", type=Path, help="manifiesto de ingesta")
    modos = analizador.add_subparsers(dest="modo", required=False)
    modos.add_parser(MODO_REINDEX_SPARSE, help="puebla el sparse de los chunks vigentes")
    brazo = modos.add_parser(
        MODO_BRAZO_DE_CHUNKS,
        help="ingiere los mismos documentos con otro tamaño de chunk en una colección propia",
    )
    brazo.add_argument(
        "--manifest", type=Path, required=True, help="el manifiesto de la ingesta de origen"
    )
    brazo.add_argument(
        "--coleccion",
        required=True,
        help="colección de Milvus del brazo (distinta de MILVUS_COLLECTION_NAME)",
    )
    brazo.add_argument("--tamano", type=int, required=True, help="tokens por chunk del brazo")
    brazo.add_argument(
        "--solape", type=int, default=None, help="tokens de solape; sin él, CORPUS_CHUNK_OVERLAP"
    )
    contexto = modos.add_parser(
        MODO_REINDEX_CONTEXTO,
        help="reconstruye el índice de una variante de contexto en una colección propia",
    )
    contexto.add_argument("--origen", required=True, help="colección de Milvus de origen")
    argumentos = analizador.parse_args(argv)
    if argumentos.modo is None and argumentos.manifest is None:
        analizador.error("--manifest es obligatorio")
    if argumentos.modo == MODO_REINDEX_SPARSE and argumentos.manifest is not None:
        analizador.error("reindex-sparse no acepta --manifest")
    return argumentos


def _sparse_real(ajustes: AjustesSparse) -> SparsePassageEncoder:
    """El codificador *sparse* REAL con pesos y *tokenizer* verificados (el ``onnxruntime`` se difiere hasta aquí). No construye
    el *tokenizer* de chunks ni el LLM: la reindexación no trocea ni genera."""
    from app.infrastructure.models.local import cargar_embeddings_y_sparse_de_pasajes

    return cargar_embeddings_y_sparse_de_pasajes(ajustes_de_modelos_del_entorno(), ajustes)[1]


def _almacen_de_milvus() -> AlmacenDeReindexacionSparse:
    milvus = MilvusSettings(_env_file=None)  # type: ignore[call-arg]
    try:
        almacen = MilvusRepository(MilvusClient(uri=milvus.milvus_uri), milvus)
        almacen.ensure_collection()
    except Exception as error:  # noqa: BLE001 - el mensaje de pymilvus puede traer la URI: solo etapa y clase
        raise FalloDeReindexacion(ETAPA_LEER, error) from None
    return almacen


def _reindexar_sparse(
    sparse: SparsePassageEncoder | None, almacen: AlmacenDeReindexacionSparse | None
) -> int:
    """``ingest reindex-sparse`` (US-117b D5): sin LLM, sin catálogo y sin PostgreSQL; solo Milvus. ``sparse`` y ``almacen``
    se inyectan solo en los tests."""
    try:
        ajustes = AjustesDeReindexacionSparse(_env_file=None)  # type: ignore[call-arg]
    except ValidationError as error:
        print(f"{NOMBRE}: configuración inválida en: {_claves_invalidas(error)}", file=sys.stderr)
        return 1
    try:
        exigir_proveedor_de_modelos_local()  # RN-12: antes de cargar modelos o abrir Milvus
        codificador = sparse if sparse is not None else _sparse_real(ajustes)
        almacen = almacen if almacen is not None else _almacen_de_milvus()
        resumen = ReindexarSparse(
            almacen=almacen,
            codificador=codificador,
            lote=ajustes.corpus_sparse_reindex_batch_size,
        ).ejecutar()
    except (
        ValidationError
    ) as error:  # la configuración de Milvus, que se valida después de la guarda
        print(f"{NOMBRE}: configuración inválida en: {_claves_invalidas(error)}", file=sys.stderr)
        return 1
    except FalloDeReindexacion as fallo:
        print(
            f"{NOMBRE} {MODO_REINDEX_SPARSE}: falló en {fallo.etapa} ({fallo.clase})",
            file=sys.stderr,
        )
        return 1
    except ModeloNoVerificadoError as error:
        print(f"{NOMBRE}: {error}", file=sys.stderr)
        return 1
    except Exception as error:  # noqa: BLE001 - se informa la clase; el mensaje puede traer una URI
        print(f"{NOMBRE} {MODO_REINDEX_SPARSE}: falló ({type(error).__name__})", file=sys.stderr)
        return 1
    print(
        json.dumps(
            {
                "modo": MODO_REINDEX_SPARSE,
                "leidos": resumen.leidos,
                "reindexados": resumen.reindexados,
            }
        )
    )
    return 0


@dataclass(frozen=True)
class PuertosDelBrazoDeChunks:
    """Bordes que un test sustituye; sin ellos la CLI compone Milvus (colección del brazo) y el catálogo en solo lectura."""

    catalogo: LectorDePoblacionDelCorpus | None = None
    almacen: ChunkStoreDeIngesta | None = None
    fuente: SourceFetcher | None = None


def _almacen_del_brazo(milvus: MilvusSettings, coleccion: str) -> ChunkStoreDeIngesta:
    """La colección PROPIA del brazo: se crea si no existe; la de ``MILVUS_COLLECTION_NAME`` ni se abre."""
    propia = milvus.model_copy(update={"milvus_collection_name": coleccion})
    almacen = MilvusRepository(MilvusClient(uri=propia.milvus_uri), propia)
    almacen.ensure_collection()
    return almacen


def _brazo_de_chunks(
    argumentos: argparse.Namespace,
    embedder: PassageEmbedder | None,
    sparse: SparsePassageEncoder | None,
    tokenizador: Tokenizador | None,
    reloj: Clock | None,
    puertos: PuertosDelBrazoDeChunks,
) -> int:
    """``ingest brazo-de-chunks``: sin LLM ni escritura en el catálogo. ``embedder``, ``sparse``, ``tokenizador`` y ``puertos`` se
    inyectan solo en los tests; en producción salen de los adapters reales verificados (RN-12)."""
    try:
        ajustes = CorpusIngestSettings(_env_file=None)  # type: ignore[call-arg]
        milvus = MilvusSettings(_env_file=None)  # type: ignore[call-arg]
        base = CorpusDatabaseSettings(_env_file=None)  # type: ignore[call-arg]
    except ValidationError as error:
        print(f"{NOMBRE}: configuración inválida en: {_claves_invalidas(error)}", file=sys.stderr)
        return 1
    if argumentos.coleccion.strip().casefold() == milvus.milvus_collection_name.strip().casefold():
        print(
            f"{NOMBRE} {MODO_BRAZO_DE_CHUNKS}: --coleccion no puede ser la de MILVUS_COLLECTION_NAME (RN-05)",
            file=sys.stderr,
        )
        return 1
    motor = None
    try:
        exigir_proveedor_de_modelos_local()  # RN-12: antes de cargar modelos o abrir Milvus
        codificadores = _modelos_de_la_ingesta(ajustes, embedder, sparse, tokenizador)
        catalogo = puertos.catalogo
        if catalogo is None:
            motor = crear_motor(
                componer_url(
                    base.corpus_database_url,
                    base.pg_rag_corpus_password_file,
                    "PG_RAG_CORPUS_PASSWORD_FILE",
                )
            )
            catalogo = CorpusDocumentRepository(motor)  # se usa solo por el puerto de lectura
        reporte = IngerirBrazoDeChunks(
            catalogo=catalogo,
            fuente=puertos.fuente or fuente_de_texto(ajustes, argumentos.manifest.resolve().parent),
            almacen=puertos.almacen or _almacen_del_brazo(milvus, argumentos.coleccion),
            embedder=codificadores[0],
            codificador_sparse=codificadores[1],
            tokenizador=codificadores[2],
            tamano_de_chunk=argumentos.tamano,
            solape_de_chunk=ajustes.corpus_chunk_overlap
            if argumentos.solape is None
            else argumentos.solape,
            reloj=reloj or RelojDelSistema(),
        ).ingerir(leer_manifiesto(argumentos.manifest))
    except (ModeloNoVerificadoError, ManifiestoInvalido) as error:
        print(f"{NOMBRE} {MODO_BRAZO_DE_CHUNKS}: {error}", file=sys.stderr)
        return 1
    except Exception as error:  # noqa: BLE001 - se informa la clase; el mensaje de la base o de pymilvus puede traer una URI
        print(f"{NOMBRE} {MODO_BRAZO_DE_CHUNKS}: falló ({type(error).__name__})", file=sys.stderr)
        return 1
    finally:
        if motor is not None:
            motor.dispose()
    print(
        json.dumps(
            {
                "modo": MODO_BRAZO_DE_CHUNKS,
                "coleccion": argumentos.coleccion,
                "tamano": argumentos.tamano,
                "chunks": reporte.chunks,
                "documentos": [
                    {
                        "document_key": r.document_key,
                        "chunks": r.chunks,
                        "omitido": r.omitido,
                        "error": r.error,
                    }
                    for r in reporte.resultados
                ],
            },
            ensure_ascii=False,
        )
    )
    return 1 if reporte.hubo_errores else 0


@dataclass(frozen=True)
class PuertosDeLaReindexacionDeContexto:
    """Bordes que un test sustituye; sin ellos la CLI compone Milvus (origen y destino), el catálogo en solo lectura y el LLM local."""

    origen: AlmacenDeReindexacionDeContexto | None = None
    destino: AlmacenDeReindexacionDeContexto | None = None
    catalogo: LectorDePoblacionDelCorpus | None = None
    llm: LlmClient | None = None


def _constructor_de_contexto(
    ajustes: AjustesDeContextoLlm, llm: LlmClient | None
) -> ConstructorDeContexto:
    """El constructor de la variante configurada; solo ``llm`` usa el LLM local (RN-12, que ya se exigió antes de llegar aquí)."""
    llm_requerido = ajustes.corpus_chunk_context is VarianteDeContexto.LLM
    if llm_requerido and llm is None:
        raise ConfiguracionDeLlmNoLocalError("LLM_BASE_URL")
    generador = (
        GeneradorLlmDeContexto(llm=llm, max_chars=ajustes.corpus_chunk_context_llm_max_chars)
        if llm_requerido and llm is not None
        else None
    )
    return constructor_de_contexto(
        ajustes.corpus_chunk_context,
        max_chars=ajustes.corpus_chunk_context_max_chars,
        generador=generador,
        doc_max_chars=ajustes.corpus_chunk_context_llm_doc_max_chars,
        concurrencia=ajustes.corpus_chunk_context_llm_concurrency,
    )


def _embedder_y_sparse_de_la_reindexacion(
    embedder: PassageEmbedder | None,
    sparse: SparsePassageEncoder | None,
    ajustes: AjustesSparse,
) -> tuple[PassageEmbedder, SparsePassageEncoder]:
    """Inyectados (solo en los tests) o, en producción, los reales y verificados por SHA-256 (RN-12). El ``onnxruntime`` se difiere."""
    if embedder is not None and sparse is not None:
        return embedder, sparse
    from app.infrastructure.models.local import cargar_embeddings_y_sparse_de_pasajes

    return cargar_embeddings_y_sparse_de_pasajes(ajustes_de_modelos_del_entorno(), ajustes)


def _almacenes_de_la_reindexacion(
    milvus: MilvusSettings, origen: str, puertos: PuertosDeLaReindexacionDeContexto
) -> tuple[AlmacenDeReindexacionDeContexto, AlmacenDeReindexacionDeContexto]:
    """El origen se abre para LEER (nunca se crea) y el destino, la colección de ``MILVUS_COLLECTION_NAME``, se crea si no existe."""
    if puertos.origen is not None and puertos.destino is not None:
        return puertos.origen, puertos.destino
    with etapa_de_reindexacion(ETAPA_LEER_ORIGEN):
        cliente = MilvusClient(uri=milvus.milvus_uri)
        de_origen = MilvusRepository(
            cliente, milvus.model_copy(update={"milvus_collection_name": origen})
        )
        de_origen.abrir_existente()
    with etapa_de_reindexacion(ETAPA_ESCRIBIR):
        destino = MilvusRepository(cliente, milvus)
        destino.ensure_collection()
    return de_origen, destino


def _reindexar_contexto(
    argumentos: argparse.Namespace,
    embedder: PassageEmbedder | None,
    sparse: SparsePassageEncoder | None,
    reloj: Clock | None,
    puertos: PuertosDeLaReindexacionDeContexto,
) -> int:
    """``ingest reindex-context`` (US-279 D4): el índice de la variante en la colección de ``MILVUS_COLLECTION_NAME``, desde la de
    ``--origen``. Las guardas (variante, colección, origen distinto, RN-12) van antes de cargar modelos o abrir conexiones; el catálogo
    entra por su puerto de solo lectura. ``embedder``, ``sparse`` y ``puertos`` se inyectan solo en los tests."""
    try:
        ajustes = AjustesDeReindexacionDeContexto(_env_file=None)  # type: ignore[call-arg]
        milvus = MilvusSettings(_env_file=None)  # type: ignore[call-arg]
    except ValidationError as error:
        print(f"{NOMBRE}: configuración inválida en: {_claves_invalidas(error)}", file=sys.stderr)
        return 1
    motor = None
    try:
        exigir_coleccion_de_la_variante(milvus.milvus_collection_name, ajustes.corpus_chunk_context)
        exigir_origen_distinto_del_destino(argumentos.origen, milvus.milvus_collection_name)
        exigir_proveedor_de_modelos_local()  # RN-12: antes de cargar modelos o abrir Milvus
        if ajustes.corpus_chunk_context is VarianteDeContexto.LLM:
            _exigir_llm_local()
        codificadores = _embedder_y_sparse_de_la_reindexacion(embedder, sparse, ajustes)
        origen, destino = _almacenes_de_la_reindexacion(milvus, argumentos.origen, puertos)
        catalogo = puertos.catalogo
        if catalogo is None:
            motor = _motor_del_catalogo(CorpusDatabaseSettings(_env_file=None))  # type: ignore[call-arg]
            catalogo = CorpusDocumentRepository(motor)  # se usa solo por el puerto de lectura
        resumen = ReindexarContexto(
            origen=origen,
            destino=destino,
            catalogo=catalogo,
            embedder=codificadores[0],
            codificador_sparse=codificadores[1],
            constructor=_constructor_de_contexto(
                ajustes, puertos.llm or _llm_de_la_reindexacion(ajustes)
            ),
            variante=ajustes.corpus_chunk_context,
            lote=ajustes.corpus_context_reindex_batch_size,
            reloj=reloj or RelojDelSistema(),
        ).ejecutar()
    except (
        ModeloNoVerificadoError,
        ConfiguracionDeLlmNoLocalError,
        ColeccionNoCorrespondeALaVariante,
        OrigenIgualAlDestino,
    ) as error:
        print(f"{NOMBRE} {MODO_REINDEX_CONTEXTO}: {error}", file=sys.stderr)
        return 1
    except ValidationError as error:
        print(f"{NOMBRE}: configuración inválida en: {_claves_invalidas(error)}", file=sys.stderr)
        return 1
    except FalloDeReindexacion as fallo:
        print(
            f"{NOMBRE} {MODO_REINDEX_CONTEXTO}: falló en {fallo.etapa} ({fallo.clase})",
            file=sys.stderr,
        )
        return 1
    except Exception as error:  # noqa: BLE001 - se informa la clase; el mensaje de la base o de pymilvus puede traer una URI
        print(f"{NOMBRE} {MODO_REINDEX_CONTEXTO}: falló ({type(error).__name__})", file=sys.stderr)
        return 1
    finally:
        if motor is not None:
            motor.dispose()
    print(json.dumps({"modo": MODO_REINDEX_CONTEXTO, **resumen.como_diccionario()}))
    return 0


def _llm_de_la_reindexacion(ajustes: AjustesDeContextoLlm) -> LlmClient | None:
    """El LLM local solo para la variante ``llm``; con las otras no se construye ningún cliente."""
    if ajustes.corpus_chunk_context is not VarianteDeContexto.LLM:
        return None
    ambiente = Settings(_env_file=None, modelos=None)  # type: ignore[call-arg]
    return _llm_local(ambiente, ajustes.corpus_metadata_llm_temperature)


def _motor_del_catalogo(base: CorpusDatabaseSettings) -> Any:
    return crear_motor(
        componer_url(
            base.corpus_database_url,
            base.pg_rag_corpus_password_file,
            "PG_RAG_CORPUS_PASSWORD_FILE",
        )
    )


def main(
    argv: Sequence[str] | None = None,
    embedder: PassageEmbedder | None = None,
    sparse: SparsePassageEncoder | None = None,
    reloj: Clock | None = None,
    tokenizador: Tokenizador | None = None,
    llm: LlmClient | None = None,
    nli: NliClassifier | None = None,
    almacen_sparse: AlmacenDeReindexacionSparse | None = None,
    llm_poblacion: LlmDePoblacion | None = None,
    puertos_brazo: PuertosDelBrazoDeChunks | None = None,
    puertos_contexto: PuertosDeLaReindexacionDeContexto | None = None,
) -> int:
    """``embedder``, ``sparse``, ``reloj``, ``tokenizador``, ``llm``, ``nli`` y ``llm_poblacion`` se inyectan solo en los tests; en
    producción salen de los adapters reales (``MODEL_PROVIDER=local``, LLM local)."""
    argumentos = _argumentos(argv)
    if argumentos.modo == MODO_REINDEX_SPARSE:
        return _reindexar_sparse(sparse, almacen_sparse)
    if argumentos.modo == MODO_REINDEX_CONTEXTO:
        return _reindexar_contexto(
            argumentos,
            embedder,
            sparse,
            reloj,
            puertos_contexto or PuertosDeLaReindexacionDeContexto(),
        )
    if argumentos.modo == MODO_BRAZO_DE_CHUNKS:
        return _brazo_de_chunks(
            argumentos,
            embedder,
            sparse,
            tokenizador,
            reloj,
            puertos_brazo or PuertosDelBrazoDeChunks(),
        )
    try:
        ajustes = CorpusIngestSettings(_env_file=None)  # type: ignore[call-arg]
        milvus = MilvusSettings(_env_file=None)  # type: ignore[call-arg]
        base = CorpusDatabaseSettings(_env_file=None)  # type: ignore[call-arg]
        politica = politica_de_licencias(ajustes, allow_cc_by_nc_del_entorno())
    except ValidationError as error:
        print(f"{NOMBRE}: configuración inválida en: {_claves_invalidas(error)}", file=sys.stderr)
        return 1
    try:
        exigir_coleccion_de_la_variante(milvus.milvus_collection_name, ajustes.corpus_chunk_context)
        _exigir_llm_local()  # RN-12: antes de cargar embeddings o abrir conexiones
        modelos = _modelos_de_la_ingesta(ajustes, embedder, sparse, tokenizador)
        de_metadatos = _modelos_de_metadatos(
            llm, nli, ajustes.corpus_metadata_llm_temperature, llm_poblacion
        )
        reporte, muestra, poblacion, corpus = _ejecutar_ingesta(
            argumentos.manifest,
            ajustes,
            milvus,
            base,
            politica,
            *modelos,
            de_metadatos,
            reloj or RelojDelSistema(),
            _constructor_de_contexto(ajustes, de_metadatos.llm),
        )
    except (
        ModeloNoVerificadoError,
        ManifiestoInvalido,
        ConfiguracionDeLlmNoLocalError,
        CatalogoDePoblacionNoConfigurado,
        PlantillaDePoblacionNoDisponible,
        ColeccionNoCorrespondeALaVariante,
    ) as error:
        print(f"{NOMBRE}: {error}", file=sys.stderr)
        return 1
    except Exception as error:  # noqa: BLE001 - se informa la clase; el mensaje de la base o de pymilvus puede traer una URI
        print(f"{NOMBRE}: falló ({type(error).__name__})", file=sys.stderr)
        return 1
    resumen = {
        **reporte.como_diccionario(),
        "contexto_del_chunk": {
            "variante": ajustes.corpus_chunk_context.value,
            "version_de_la_plantilla": VERSION_DE_LA_PLANTILLA,
            **reporte.contadores_de_contexto(),
        },
        "corpus_por_tipo_y_fuente": corpus,
        "muestra_de_metadatos": muestra,
    }
    if poblacion is not None:
        resumen["poblacion_por_tipo_e_idioma"] = poblacion
    print(json.dumps(resumen, ensure_ascii=False))
    return 1 if reporte.hubo_errores else 0


if __name__ == "__main__":
    sys.exit(main())
