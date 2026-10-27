"""Ingesta en lote reanudable del corpus (US-117a, L1D-116): raíz de composición del ``IngestionPipelineService``.

    python -m app.scripts.ingest --manifest <ruta>

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

from pydantic import ValidationError
from pymilvus import MilvusClient

from app.application.corpus_ingestion.ingestion_pipeline_service import IngestionPipelineService
from app.application.corpus_ingestion.ports import (
    AlmacenDeReindexacionSparse,
    SparsePassageEncoder,
)
from app.application.corpus_ingestion.reindexar_sparse import (
    ETAPA_LEER,
    FalloDeReindexacion,
    ReindexarSparse,
)
from app.application.corpus_ingestion.reporte import ReporteDeIngesta
from app.application.corpus_metadata.esquema import PROMPT_VERSION
from app.application.corpus_metadata.metadata_extraction_service import MetadataExtractionService
from app.application.corpus_metadata.muestra_de_metadatos import GeneradorDeMuestraDeMetadatos
from app.application.ports import Clock, LlmClient, NliClassifier
from app.application.seed_corpus.ports import PassageEmbedder
from app.config.settings import (
    AjustesDeReindexacionSparse,
    AjustesSparse,
    CorpusDatabaseSettings,
    CorpusIngestSettings,
    MilvusSettings,
    Settings,
)
from app.domain.corpus_seed.admisibilidad import PoliticaDeLicencias
from app.domain.corpus_seed.chunking import Tokenizador
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


def _modelos_de_metadatos(
    llm: LlmClient | None, nli: NliClassifier | None, temperatura: float
) -> ModelosDeMetadatos:
    """Inyectados (solo en los tests) o, en producción, el LLM local (RN-12) y el NLI real verificado.

    Sin ``NLI_ENTAILMENT_THRESHOLD`` no hay umbral que aplicar: falla nombrando la variable (RN-22).
    """
    ambiente = Settings(_env_file=None, modelos=None)  # type: ignore[call-arg]
    if ambiente.nli_entailment_threshold is None:
        raise ModeloNoVerificadoError("NLI_ENTAILMENT_THRESHOLD")
    return ModelosDeMetadatos(
        llm=llm or _llm_local(ambiente, temperatura),
        nli=nli or _nli_real(),
        umbral_nli=ambiente.nli_entailment_threshold,
        nombre_del_llm=ambiente.llm_model or "no_declarado",
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


def _llm_local(ambiente: Settings, temperatura: float) -> LlmClient:
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
) -> tuple[ReporteDeIngesta, dict[str, object]]:
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
        catalogo = CorpusDocumentRepository(motor)
        servicio = IngestionPipelineService(
            catalogo=catalogo,
            almacen_de_chunks=almacen,
            embedder=embedder,
            codificador_sparse=sparse,
            resolutor_de_metadatos=servicio_de_metadatos(metadatos),
            fuente=fuente_de_texto(ajustes, manifiesto.resolve().parent),
            reloj=reloj,
            ids=UuidIdGenerator("release"),
            politica=politica,
            tokenizador=tokenizador,
            tamano_de_chunk=ajustes.corpus_chunk_size,
            solape_de_chunk=ajustes.corpus_chunk_overlap,
            fecha_de_corte=ajustes.corpus_cutoff_date,
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
        return reporte, escribir_muestra(generador, reporte.release_id)
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


def _argumentos(argv: Sequence[str] | None) -> argparse.Namespace:
    """Sin modo rige ``ingest``: ``--manifest`` obligatorio (validado a mano). ``reindex-sparse`` no acepta ``--manifest``."""
    analizador = argparse.ArgumentParser(prog="python -m app.scripts.ingest", description=__doc__)
    analizador.add_argument("--manifest", type=Path, help="manifiesto de ingesta")
    modos = analizador.add_subparsers(dest="modo", required=False)
    modos.add_parser(MODO_REINDEX_SPARSE, help="puebla el sparse de los chunks vigentes")
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
    try:
        milvus = MilvusSettings(_env_file=None)  # type: ignore[call-arg]
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
        codificador = sparse or _sparse_real(ajustes)
        almacen = almacen or _almacen_de_milvus()
        resumen = ReindexarSparse(
            almacen=almacen,
            codificador=codificador,
            lote=ajustes.corpus_sparse_reindex_batch_size,
        ).ejecutar()
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


def main(
    argv: Sequence[str] | None = None,
    embedder: PassageEmbedder | None = None,
    sparse: SparsePassageEncoder | None = None,
    reloj: Clock | None = None,
    tokenizador: Tokenizador | None = None,
    llm: LlmClient | None = None,
    nli: NliClassifier | None = None,
    almacen_sparse: AlmacenDeReindexacionSparse | None = None,
) -> int:
    """``embedder``, ``sparse``, ``reloj``, ``tokenizador``, ``llm`` y ``nli`` se inyectan solo en los tests; en
    producción salen de los adapters reales (``MODEL_PROVIDER=local``, LLM local)."""
    argumentos = _argumentos(argv)
    if argumentos.modo == MODO_REINDEX_SPARSE:
        return _reindexar_sparse(sparse, almacen_sparse)
    try:
        ajustes = CorpusIngestSettings(_env_file=None)  # type: ignore[call-arg]
        milvus = MilvusSettings(_env_file=None)  # type: ignore[call-arg]
        base = CorpusDatabaseSettings(_env_file=None)  # type: ignore[call-arg]
        politica = politica_de_licencias(ajustes, allow_cc_by_nc_del_entorno())
    except ValidationError as error:
        print(f"{NOMBRE}: configuración inválida en: {_claves_invalidas(error)}", file=sys.stderr)
        return 1
    try:
        _exigir_llm_local()  # RN-12: antes de cargar embeddings o abrir conexiones
        modelos = _modelos_de_la_ingesta(ajustes, embedder, sparse, tokenizador)
        reporte, muestra = _ejecutar_ingesta(
            argumentos.manifest,
            ajustes,
            milvus,
            base,
            politica,
            *modelos,
            _modelos_de_metadatos(llm, nli, ajustes.corpus_metadata_llm_temperature),
            reloj or RelojDelSistema(),
        )
    except (ModeloNoVerificadoError, ManifiestoInvalido, ConfiguracionDeLlmNoLocalError) as error:
        print(f"{NOMBRE}: {error}", file=sys.stderr)
        return 1
    except Exception as error:  # noqa: BLE001 - se informa la clase; el mensaje de la base o de pymilvus puede traer una URI
        print(f"{NOMBRE}: falló ({type(error).__name__})", file=sys.stderr)
        return 1
    resumen = {**reporte.como_diccionario(), "muestra_de_metadatos": muestra}
    print(json.dumps(resumen, ensure_ascii=False))
    return 1 if reporte.hubo_errores else 0


if __name__ == "__main__":
    sys.exit(main())
