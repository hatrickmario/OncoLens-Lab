"""Configuración de rag-orchestrator (RN-22): todo valor a calibrar viene del entorno."""

import os
import re
from datetime import date
from pathlib import Path
from typing import Annotated, Any, Literal, Self
from urllib.parse import urlsplit

from pydantic import Field, ValidationInfo, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict
from sqlalchemy.engine import make_url
from sqlalchemy.exc import ArgumentError

from app.config import modelos
from app.config.modelos import CLAVES_ADR39, ConfigModelos, cargar_config_modelos
from app.domain.corpus_seed.admisibilidad import (
    ClaseDeLicencia,
    clase_contradice_el_texto,
)
from app.domain.corpus_seed.chunking import validar_ventana
from app.domain.fusion_de_candidatos import HYBRID_SPARSE_WEIGHT_INICIAL, RRF_K_INICIAL
from app.domain.reglas_proveedor import (
    HOSTS_LOCALES,
    reject_fake_model_provider_with_real_data,
    reject_fake_provider_with_real_data,
)

_SHA256 = re.compile(r"[0-9a-fA-F]{64}")
POBLACION_MAX_VALORES_POR_CRITERIO_INICIAL = 3
"""Valor inicial de ``POPULATION_MAX_VALUES_PER_CRITERION`` (ADR-47): el único lugar donde aparece el literal."""
HOSTS_LOCALES_DEL_LLM = tuple(sorted(HOSTS_LOCALES))


class Settings(BaseSettings):
    model_config = SettingsConfigDict(extra="ignore", hide_input_in_errors=True)

    app_env: str = "local"
    llm_provider: Literal["local", "fake"] = "local"
    # RN-12: el LLM solo vive en el equipo (nativo, fuera de Docker). La lista de hosts permitidos es configuración (RN-22).
    llm_allowed_hosts: Annotated[tuple[str, ...], NoDecode] = HOSTS_LOCALES_DEL_LLM
    llm_base_url: str = "http://host.docker.internal:11434/v1"
    llm_model: str = ""
    llm_health_timeout_ms: int = Field(default=2000, gt=0)
    # Generación de /rag/query (US-225, RN-22): plazo de la llamada al LLM local y tope de tokens de su salida.
    llm_request_timeout_ms: int = Field(default=60000, gt=0)
    llm_max_output_tokens: int = Field(default=2048, gt=0)
    llm_cloud_enabled: bool = False
    # RN-20, RN-22, US-043: tipos de cáncer con análisis (separados por comas); vacía = ninguno (falla cerrada).
    enabled_cancer_types: Annotated[tuple[str, ...], NoDecode] = ()
    # ADR-39 fase B (US-224, RN-22). `LLM_NUM_CTX` lo aplica el runtime nativo (OLLAMA_CONTEXT_LENGTH): la API
    # compatible con OpenAI no lo recibe por petición. El modelo elegido (`LLM_MODEL`) lo fija el ADR al aprobarse.
    llm_num_ctx: int = Field(default=8192, gt=0)
    llm_temperature: float = Field(default=0.0, ge=0.0, le=2.0)
    # Párrafos de detalle por opción que se piden al LLM (ARR-08, RN-22); 0 desactiva el detalle. El contrato admite hasta 2.
    details_max_paragraphs: int = Field(default=2, ge=0, le=2)
    # Presupuesto de caracteres de fragmentos que entran al prompt (RN-22): la ventana de LLM_NUM_CTX se reparte con la salida.
    llm_fragments_max_chars: int = Field(default=12000, gt=0)
    # Motor y idiomas del OCR (los consume FEAT-01b, S2): un motor desconocido falla al arrancar.
    ocr_engine: Literal["ocrmypdf-tesseract", "paddleocr", "doctr"] = "ocrmypdf-tesseract"
    ocr_languages: str = Field(default="spa", min_length=1)
    real_anonymized_enabled: bool = False
    real_identified_enabled: bool = False
    # RN-21: CC BY-NC solo en el MVP académico; sin esta clave el cargador de datasets la rechaza.
    allow_cc_by_nc: bool = False
    fake_responses_path: Path = Path("/contracts/examples")
    # Catálogos versionados montados de solo lectura (lista de términos prohibidos, RN-23); sin valor por defecto en código.
    clinical_catalog_path: Path | None = None
    # JWT de servicio (US-054): la vida máxima y la tolerancia de reloj se calibran; la clave pública es de L1D-165.
    service_jwt_ttl_seconds: int = Field(default=60, gt=0)
    service_jwt_clock_skew_seconds: int = Field(default=5, ge=0)
    service_jwt_public_key_file: Path | None = None
    # Recuperación de /rag/query (US-055, RN-22). Sin valor por defecto en código: el umbral lo calibra la evaluación
    # (US-072) y el arranque de /rag/query con LLM_PROVIDER=local se niega si falta alguno (ver bootstrap).
    relevance_threshold: float | None = Field(default=None, ge=0.0, le=1.0)
    retrieval_top_k: int | None = Field(default=None, gt=0)
    # Recuperación híbrida (US-112, RN-22): `dense` por defecto (sin la rama sparse); un valor inválido falla al arrancar.
    retrieval_mode: Literal["dense", "hibrida"] = "dense"
    retrieval_fusion: Literal["rrf", "ponderada"] = "rrf"
    rrf_k: int = Field(default=RRF_K_INICIAL, ge=1)
    hybrid_sparse_weight: float = Field(default=HYBRID_SPARSE_WEIGHT_INICIAL, gt=0.0, lt=1.0)
    rerank_top_n: int | None = Field(default=None, gt=0)
    # Longitud máxima del código de tipo de cáncer que entra al filtro de Milvus (RN-22).
    retrieval_cancer_type_max_length: int = Field(default=64, gt=0)
    # Probabilidad mínima de `entailment` que cuenta como soporte (RN-01, RN-22, L1D-180); la calibra la evaluación (US-072).
    nli_entailment_threshold: float | None = Field(default=None, ge=0.0, le=1.0)
    # Modelos de recuperación y verificación (ADR-39): opcional; en producción no se exigen las claves de medición.
    modelos: ConfigModelos | None = None
    # Modelos locales de recuperación (US-231a, RN-12): enum estricto fake|local. Sin definir es `fake`: con
    # LLM_PROVIDER=local eso responde 503 fallando cerrado y nunca recupera con fakes.
    model_provider: Literal["fake", "local"] = "fake"
    # Idioma que se asume cuando el detector no puede decidir (RN-22).
    default_query_language: Literal["es", "en"] = "es"
    # Tope de valores de población por fragmento y criterio al extraer, persistir y leer (ADR-47, RN-22).
    population_max_values_per_criterion: int = Field(
        default=POBLACION_MAX_VALORES_POR_CRITERIO_INICIAL, gt=0
    )
    # Un archivo cargado = una ruta y un SHA-256 (RN-22); se verifican al arrancar con MODEL_PROVIDER=local.
    embedding_model_path: Path | None = None
    embedding_model_sha256: str | None = None
    embedding_tokenizer_path: Path | None = None
    embedding_tokenizer_sha256: str | None = None
    reranker_model_path: Path | None = None
    reranker_model_sha256: str | None = None
    reranker_tokenizer_path: Path | None = None
    reranker_tokenizer_sha256: str | None = None
    # NLI de soporte (US-231b): mismo mecanismo, un SHA-256 por archivo cargado. Un ONNX con datos externos
    # (`*.onnx.data`) exige además su par `NLI_MODEL_DATA_*`; el recomendado es reexportarlo en un solo archivo.
    nli_model_path: Path | None = None
    nli_model_sha256: str | None = None
    nli_tokenizer_path: Path | None = None
    nli_tokenizer_sha256: str | None = None
    nli_model_data_path: Path | None = None
    nli_model_data_sha256: str | None = None
    # Columna de cada clase en la salida del modelo (configuración versionada, RN-22): nunca el config.json del modelo.
    # Se validan al arrancar con MODEL_PROVIDER=local (tres enteros distintos en [0, 2]).
    nli_label_index_entailment: int | None = None
    nli_label_index_neutral: int | None = None
    nli_label_index_contradiction: int | None = None
    # Un par (premisa, hipótesis) más largo que esto falla cerrado (no se recorta la hipótesis, RN-01).
    nli_max_length: int = Field(default=512, gt=0)
    embedding_max_length: int = Field(default=8192, gt=0)
    model_intra_op_threads: int = Field(default=8, gt=0)
    model_batch_max_tokens: int = Field(default=4096, gt=0)

    @model_validator(mode="before")
    @classmethod
    def _componer_modelos_desde_el_entorno(cls, datos: Any) -> Any:
        """Si el entorno trae alguna clave de ADR-39 se validan todas juntas; si no trae ninguna, ``modelos`` es None.

        Una clave vacía (``${CLAVE:-}`` del Compose) cuenta como ausente.
        """
        if (
            isinstance(datos, dict)
            and "modelos" not in datos
            and any(os.environ.get(k) for k in CLAVES_ADR39)
        ):
            return {**datos, "modelos": cargar_config_modelos(os.environ)}
        return datos

    @field_validator("llm_allowed_hosts", mode="before")
    @classmethod
    def _hosts_del_llm_separados_por_comas(cls, valor: Any) -> Any:
        return _lista_separada_por_comas(valor)

    @field_validator("enabled_cancer_types", mode="before")
    @classmethod
    def _tipos_habilitados_separados_por_comas(cls, valor: Any) -> Any:
        return _lista_separada_por_comas(valor)

    @field_validator("llm_base_url")
    @classmethod
    def _llm_base_url_en_un_host_local(cls, valor: str, info: ValidationInfo) -> str:
        """RN-12: ni credenciales ni un host fuera de la lista; el error nombra la clave y NUNCA el valor."""
        try:
            url = urlsplit(valor)
            host = url.hostname
            credenciales = url.username is not None or url.password is not None
        except ValueError:
            raise ValueError("LLM_BASE_URL: no es una URL válida") from None
        if url.scheme not in ("http", "https") or not host:
            raise ValueError("LLM_BASE_URL: debe ser una URL http(s) con host")
        if credenciales:
            raise ValueError("LLM_BASE_URL: no puede llevar credenciales")
        permitidos = info.data.get("llm_allowed_hosts", HOSTS_LOCALES_DEL_LLM)
        if host.lower() not in {h.lower() for h in permitidos}:
            raise ValueError("LLM_BASE_URL: el host no es local (RN-12); ver LLM_ALLOWED_HOSTS")
        return valor

    @field_validator("model_provider", mode="before")
    @classmethod
    def _proveedor_de_modelos_estricto(cls, valor: Any) -> Any:
        if valor not in ("fake", "local"):
            raise ValueError("MODEL_PROVIDER: debe ser fake o local")
        return valor

    @field_validator(
        "embedding_model_path",
        "embedding_model_sha256",
        "embedding_tokenizer_path",
        "embedding_tokenizer_sha256",
        "reranker_model_path",
        "reranker_model_sha256",
        "reranker_tokenizer_path",
        "reranker_tokenizer_sha256",
        "nli_model_path",
        "nli_model_sha256",
        "nli_tokenizer_path",
        "nli_tokenizer_sha256",
        "nli_model_data_path",
        "nli_model_data_sha256",
        "nli_label_index_entailment",
        "nli_label_index_neutral",
        "nli_label_index_contradiction",
        "nli_entailment_threshold",
        "clinical_catalog_path",
        mode="before",
    )
    @classmethod
    def _vacio_es_ausente(cls, valor: Any) -> Any:
        return None if valor == "" else valor

    @field_validator(
        "embedding_model_sha256",
        "embedding_tokenizer_sha256",
        "reranker_model_sha256",
        "reranker_tokenizer_sha256",
        "nli_model_sha256",
        "nli_tokenizer_sha256",
        "nli_model_data_sha256",
    )
    @classmethod
    def _sha256_hexadecimal(cls, valor: str | None, info: ValidationInfo) -> str | None:
        if valor is not None and not _SHA256.fullmatch(valor):
            raise ValueError(f"{str(info.field_name).upper()}: debe ser un SHA-256 hexadecimal")
        return valor

    @model_validator(mode="after")
    def _rechazar_fake_con_datos_reales(self) -> Self:
        reject_fake_provider_with_real_data(
            self.llm_provider, self.real_anonymized_enabled, self.real_identified_enabled
        )
        reject_fake_model_provider_with_real_data(
            self.model_provider, self.real_anonymized_enabled, self.real_identified_enabled
        )
        return self


# Valores de /rag/query sin defecto en código (RN-22): los calibra la evaluación (US-072).
CAMPOS_DE_RECUPERACION = (
    "relevance_threshold",
    "retrieval_top_k",
    "rerank_top_n",
    "nli_entailment_threshold",
)


def claves_de_recuperacion_ausentes(settings: Settings) -> list[str]:
    """Nombres de las variables de la recuperación que faltan; una sola fuente para el arranque y la composición.

    ``ENABLED_CANCER_TYPES`` vacía cuenta como ausente (RN-20): sin ella ningún tipo está habilitado."""
    ausentes = [
        campo.upper() for campo in CAMPOS_DE_RECUPERACION if getattr(settings, campo) is None
    ]
    if not settings.enabled_cancer_types:
        ausentes.append("ENABLED_CANCER_TYPES")
    return ausentes


def nombres_de_claves(settings: Settings) -> list[str]:
    """Nombres (nunca valores) de las variables realmente definidas, ordenados: lo que `/health` expone como
    ``configKeys`` (mismo significado que en clinical-api: claves leídas con valor, no las que solo tienen defecto)."""
    claves = {nombre.upper() for nombre in settings.model_fields_set if nombre != "modelos"}
    if settings.modelos is not None:
        claves.update(CLAVES_ADR39)
    return sorted(claves)


# --- Corpus (US-058, L1D-114): tres configuraciones separadas por mínimo privilegio -----------------------------------
# Cada proceso carga solo la suya: el *one-shot* `corpus-migrate` nunca ve la contraseña del runtime, el runtime nunca la
# del migrator, y el inicializador de la colección no recibe ninguna credencial de PostgreSQL [S1 resp. 14b].
# Una clave ausente o inválida da un error que nombra la clave y nunca su valor (`hide_input_in_errors`).

ROL_RUNTIME_CORPUS = "rag_corpus"
ROL_MIGRADOR_CORPUS = "rag_corpus_migrator"
SCHEMA_CORPUS = "corpus"


def _validar_url_de_corpus(clave: str, valor: str, rol: str) -> str:
    """La URL lleva el rol esperado, `sslmode=require` y NINGUNA contraseña (esa va en un archivo `*_FILE`)."""
    try:
        url = make_url(valor)
    except ArgumentError as error:
        raise ValueError(f"{clave}: no es una URL de PostgreSQL válida") from error
    if not url.drivername.startswith("postgresql"):
        raise ValueError(f"{clave}: debe ser una URL de PostgreSQL")
    if url.username != rol:
        raise ValueError(f"{clave}: el usuario debe ser {rol}")
    if url.password is not None:
        raise ValueError(f"{clave}: no puede llevar contraseña; va en el archivo del secreto")
    if url.query.get("sslmode") != "require":
        raise ValueError(f"{clave}: debe llevar sslmode=require (SEG-08)")
    return valor


class CorpusDatabaseSettings(BaseSettings):
    """Conexión de RUNTIME al schema `corpus`: rol `rag_corpus` (USAGE + DML), sin DDL."""

    model_config = SettingsConfigDict(extra="ignore", hide_input_in_errors=True)

    corpus_database_url: str
    pg_rag_corpus_password_file: Path
    # Plazo de conexión (RN-22): un PostgreSQL que no responde no cuelga la sonda de arranque de `/rag/query`.
    corpus_connect_timeout_seconds: int = Field(default=5, gt=0)

    @field_validator("corpus_database_url")
    @classmethod
    def _url_del_runtime(cls, valor: str) -> str:
        return _validar_url_de_corpus("CORPUS_DATABASE_URL", valor, ROL_RUNTIME_CORPUS)


class CorpusMigratorSettings(BaseSettings):
    """Conexión de MIGRACIONES: rol `rag_corpus_migrator`; solo la lee el *one-shot* `corpus-migrate`."""

    model_config = SettingsConfigDict(extra="ignore", hide_input_in_errors=True)

    corpus_migrator_database_url: str
    pg_rag_corpus_migrator_password_file: Path

    @field_validator("corpus_migrator_database_url")
    @classmethod
    def _url_del_migrador(cls, valor: str) -> str:
        return _validar_url_de_corpus("CORPUS_MIGRATOR_DATABASE_URL", valor, ROL_MIGRADOR_CORPUS)


class MilvusSettings(BaseSettings):
    """Colección `corpus_chunks`. Sin valor por defecto en código para lo que fija ADR-39 (dimensión, índice dense)."""

    model_config = SettingsConfigDict(extra="ignore", hide_input_in_errors=True)

    milvus_uri: str
    milvus_collection_name: str = "corpus_chunks"
    # Plazo de la conexión y de la sonda de arranque de `/rag/query` (RN-22): un Milvus caído no cuelga el proceso.
    milvus_connect_timeout_seconds: float = Field(default=5.0, gt=0)
    embedding_dim: int
    vector_index_type: str
    vector_index_params: dict[str, Any]
    milvus_dense_metric_type: Literal["COSINE", "IP"]
    milvus_sparse_index_type: str = "SPARSE_INVERTED_INDEX"
    milvus_sparse_metric_type: Literal["IP"] = "IP"
    # Longitudes máximas de los VARCHAR (RN-22): Milvus las exige y admite hasta 65535.
    milvus_len_chunk_id: int = Field(default=128, gt=0, le=65535)
    milvus_len_document_id: int = Field(default=128, gt=0, le=65535)
    milvus_len_chunk_text: int = Field(default=16384, gt=0, le=65535)
    milvus_len_section: int = Field(default=512, gt=0, le=65535)
    milvus_len_source_type: int = Field(default=64, gt=0, le=65535)
    milvus_len_language: int = Field(default=16, gt=0, le=65535)
    milvus_len_cancer_type_tags: int = Field(default=512, gt=0, le=65535)
    milvus_len_population: int = Field(default=64, gt=0, le=65535)
    milvus_len_study_design: int = Field(default=64, gt=0, le=65535)

    @field_validator("embedding_dim")
    @classmethod
    def _dimension_positiva(cls, valor: int) -> int:
        # Misma regla que la configuración de ADR-39 (app/config/modelos.py): una sola fuente.
        return modelos.entero_positivo(str(valor))

    @field_validator("vector_index_type")
    @classmethod
    def _tipo_de_indice_permitido(cls, valor: str) -> str:
        # Se lee TIPOS_INDICE en cada validación: ADR-39 es la única fuente de los tipos admitidos.
        return modelos.opcion(*modelos.TIPOS_INDICE)(valor)


# --- Cargador de la semilla (US-059, L1D-115) ---------------------------------------------------------------------------
# Todo valor a calibrar del cargador (RN-22): licencias, fuentes excluidas, fecha de corte, tamaño de chunk y egreso.
# El tamaño y el solapamiento del chunk se validan con las mismas reglas que ADR-39 (app/config/modelos.py).

CLASES_DE_LICENCIA = tuple(clase.value for clase in ClaseDeLicencia)
# Texto literal de la licencia (normalizado) -> license_class. CC0 y el texto libre de copyright de NCI se asimilan a
# dominio público (ADR-36, decisión 2). Una licencia ND no figura aquí ni puede añadirse: el dominio la rechaza siempre.
MAPA_DE_LICENCIAS_POR_DEFECTO = {
    "cc0": "dominio_publico",
    "cc0 1.0": "dominio_publico",
    "dominio público": "dominio_publico",
    "texto de nci libre de copyright": "dominio_publico",
    # Europe PMC publica la licencia sin versión ("cc by"); el XML del artículo puede precisarla (4.0, 3.0).
    "cc by": "cc_by",
    "cc by 4.0": "cc_by",
    "cc by 3.0": "cc_by",
    "cc by-sa": "cc_by_sa",
    "cc by-sa 4.0": "cc_by_sa",
    "cc by-sa 3.0": "cc_by_sa",
    "cc by-nc": "cc_by_nc",
    "cc by-nc 4.0": "cc_by_nc",
    "cc by-nc 3.0": "cc_by_nc",
}


def _lista_separada_por_comas(valor: Any) -> Any:
    if isinstance(valor, str):
        return tuple(x.strip() for x in valor.split(",") if x.strip())
    return valor


class AjustesDeCorpus(BaseSettings):
    """Claves comunes del cargador de la semilla y de la ingesta en lote (licencias, fuentes excluidas, chunking, descargas)."""

    model_config = SettingsConfigDict(extra="ignore", hide_input_in_errors=True)

    corpus_accepted_licenses: Annotated[tuple[str, ...], NoDecode]
    corpus_excluded_sources: Annotated[tuple[str, ...], NoDecode]
    corpus_cutoff_date: date
    corpus_chunk_size: int
    corpus_chunk_overlap: int
    corpus_chunking_strategy: str = "tamano_fijo"
    corpus_license_class_map: dict[str, str] = Field(
        default_factory=lambda: dict(MAPA_DE_LICENCIAS_POR_DEFECTO)
    )
    # Sin hosts permitidos el cargador no descarga nada: solo lee textos del disco.
    corpus_fetch_allowed_hosts: Annotated[tuple[str, ...], NoDecode] = ()
    corpus_fetch_timeout_seconds: float = Field(default=30.0, gt=0)
    corpus_fetch_max_bytes: int = Field(default=5_000_000, gt=0)
    # Plazo TOTAL de una descarga (no por lectura): un servidor que gotea bytes no la retiene indefinidamente.
    corpus_fetch_deadline_seconds: float = Field(default=60.0, gt=0)

    @field_validator(
        "corpus_accepted_licenses",
        "corpus_excluded_sources",
        "corpus_fetch_allowed_hosts",
        mode="before",
    )
    @classmethod
    def _separar_por_comas(cls, valor: Any) -> Any:
        return _lista_separada_por_comas(valor)

    @field_validator("corpus_accepted_licenses")
    @classmethod
    def _clases_conocidas(cls, valor: tuple[str, ...]) -> tuple[str, ...]:
        desconocidas = sorted(set(valor) - set(CLASES_DE_LICENCIA))
        if not valor or desconocidas:
            raise ValueError(f"debe listar clases de {CLASES_DE_LICENCIA}")
        return valor

    @field_validator("corpus_license_class_map")
    @classmethod
    def _mapa_a_clases_conocidas(cls, valor: dict[str, str]) -> dict[str, str]:
        if not set(valor.values()) <= set(CLASES_DE_LICENCIA):
            raise ValueError(f"cada valor debe ser una de {CLASES_DE_LICENCIA}")
        incoherentes = [
            texto for texto, clase in valor.items() if clase_contradice_el_texto(texto, clase)
        ]
        if incoherentes:
            raise ValueError(
                "ninguna clave puede llevar ND, y una clave NC o SA debe apuntar a cc_by_nc o cc_by_sa"
            )
        return valor

    @field_validator("corpus_chunk_size")
    @classmethod
    def _tamano_positivo(cls, valor: int) -> int:
        return modelos.entero_positivo(str(valor))

    @field_validator("corpus_chunk_overlap")
    @classmethod
    def _solapamiento_no_negativo(cls, valor: int) -> int:
        if valor < 0:
            raise ValueError("no puede ser negativo")
        return valor

    @field_validator("corpus_chunking_strategy")
    @classmethod
    def _estrategia_de_tamano_fijo(cls, valor: str) -> str:
        # ADR-39 admite también "estructura"; el cargador de la semilla solo fragmenta por tamaño fijo.
        if valor != "tamano_fijo":
            raise ValueError("el cargador de la semilla solo admite tamano_fijo")
        return valor

    @model_validator(mode="after")
    def _solapamiento_menor_que_el_tamano(self) -> Self:
        try:
            validar_ventana(self.corpus_chunk_size, self.corpus_chunk_overlap)
        except ValueError as exc:
            raise ValueError(f"CORPUS_CHUNK_OVERLAP / CORPUS_CHUNK_SIZE: {exc}") from None
        return self


class CorpusSeedSettings(AjustesDeCorpus):
    """Configuración del cargador ``python -m app.scripts.load_seed_corpus``; una clave obligatoria ausente falla al arrancar."""

    corpus_seed_manifest_path: Path


class AjustesSparse(BaseSettings):
    """Origen del *sparse* y pesos de su cabeza lineal (ADR-39, RN-22), verificados por SHA-256.

    Base común de ``ingest`` y de ``ingest reindex-sparse`` (US-117b D5): este último no exige licencias, corte ni *chunking*."""

    model_config = SettingsConfigDict(extra="ignore", hide_input_in_errors=True)

    sparse_vector_source: str
    # Pesos de ``sparse_linear`` de BGE-M3 (ADR-39): no se versionan en el repo; solo la ruta y el SHA-256 (US-117a, 1.10).
    embedding_sparse_weights_path: Path
    embedding_sparse_weights_sha256: str

    @field_validator("sparse_vector_source")
    @classmethod
    def _origen_admitido(cls, valor: str) -> str:
        return modelos.opcion(*modelos.SPARSE_VECTOR_SOURCES_ADMITIDAS)(valor)

    @field_validator("embedding_sparse_weights_sha256")
    @classmethod
    def _sha256_hexadecimal(cls, valor: str) -> str:
        if not re.fullmatch(r"[0-9a-f]{64}", valor):
            raise ValueError("debe ser un SHA-256 hexadecimal en minúsculas")
        return valor


class AjustesDeReindexacionSparse(AjustesSparse):
    """Configuración de ``python -m app.scripts.ingest reindex-sparse`` (US-117b D4/D5, RN-22).

    El tope superior del lote (``LIMITE_DE_CONSULTA``) es de infraestructura y lo valida el repositorio de Milvus."""

    corpus_sparse_reindex_batch_size: int = Field(default=64, gt=0)


class CorpusIngestSettings(AjustesDeCorpus, AjustesSparse):
    """Configuración de ``python -m app.scripts.ingest`` (US-117a, RN-22): las claves de la semilla sin el manifiesto
    (llega por ``--manifest``) más el origen del *sparse* y los pesos de su cabeza lineal (``AjustesSparse``)."""

    # Muestra de metadatos extraídos para revisión humana (US-118, TBD-20, RN-22): porcentaje, semilla y directorio.
    corpus_metadata_sample_pct: float = Field(default=10.0, ge=0.0, le=100.0)
    corpus_metadata_sample_seed: str = Field(default="oncolens-metadatos", min_length=1)
    corpus_metadata_sample_dir: Path = Path("data/evaluation/corpus-metadatos")
    # Temperatura del LLM en la extracción de metadatos (RN-22): propia, no la de la generación de /rag/query.
    corpus_metadata_llm_temperature: float = Field(default=0.0, ge=0.0, le=2.0)
