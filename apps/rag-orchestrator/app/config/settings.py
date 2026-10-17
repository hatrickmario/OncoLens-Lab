"""Configuración de rag-orchestrator (RN-22): todo valor a calibrar viene del entorno."""

import os
from pathlib import Path
from typing import Any, Literal, Self

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import make_url
from sqlalchemy.exc import ArgumentError

from app.config import modelos
from app.config.modelos import CLAVES_ADR39, ConfigModelos, cargar_config_modelos
from app.domain.reglas_proveedor import reject_fake_provider_with_real_data


class Settings(BaseSettings):
    model_config = SettingsConfigDict(extra="ignore", hide_input_in_errors=True)

    app_env: str = "local"
    llm_provider: Literal["local", "fake"] = "local"
    llm_base_url: str = "http://host.docker.internal:11434/v1"
    llm_model: str = ""
    llm_health_timeout_ms: int = Field(default=2000, gt=0)
    llm_cloud_enabled: bool = False
    real_anonymized_enabled: bool = False
    real_identified_enabled: bool = False
    # RN-21: CC BY-NC solo en el MVP académico; sin esta clave el cargador de datasets la rechaza.
    allow_cc_by_nc: bool = False
    fake_responses_path: Path = Path("/contracts/examples")
    # JWT de servicio (US-054): la vida máxima y la tolerancia de reloj se calibran; la clave pública es de L1D-165.
    service_jwt_ttl_seconds: int = Field(default=60, gt=0)
    service_jwt_clock_skew_seconds: int = Field(default=5, ge=0)
    service_jwt_public_key_file: Path | None = None
    # Modelos de recuperación y verificación (ADR-39): opcional; en producción no se exigen las claves de medición.
    modelos: ConfigModelos | None = None

    @model_validator(mode="before")
    @classmethod
    def _componer_modelos_desde_el_entorno(cls, datos: Any) -> Any:
        """Si el entorno trae alguna clave de ADR-39 se validan todas juntas; si no trae ninguna, ``modelos`` es None."""
        if (
            isinstance(datos, dict)
            and "modelos" not in datos
            and any(k in os.environ for k in CLAVES_ADR39)
        ):
            return {**datos, "modelos": cargar_config_modelos(os.environ)}
        return datos

    @model_validator(mode="after")
    def _rechazar_fake_con_datos_reales(self) -> Self:
        reject_fake_provider_with_real_data(
            self.llm_provider, self.real_anonymized_enabled, self.real_identified_enabled
        )
        return self


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
    embedding_dim: int
    vector_index_type: str
    vector_index_params: dict[str, Any]
    milvus_dense_metric_type: Literal["COSINE", "IP", "L2"]
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
