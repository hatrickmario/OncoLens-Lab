"""Catálogo del corpus (schema `corpus`): transcripción de `docs/architecture/data-model.md` §4.6 (US-058, L1D-114).

SQLAlchemy Core, sin ORM: no hay lógica de dominio que lo justifique y `alembic check` compara contra este
``MetaData``. Una columna es ``NOT NULL`` salvo que el documento la marque ``nullable``. Los dominios cerrados son
``CHECK`` con nombre ``ck_corpus_document_<columna>`` (no tipos ``ENUM``): habilitar un valor es un
``DROP/ADD CONSTRAINT`` en una migración. Sin NCCN ni ESMO ni ninguna licencia ND como valor (RN-21).
"""

from __future__ import annotations

from typing import Final

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from app.config.settings import SCHEMA_CORPUS
from app.domain.corpus_seed.admisibilidad import ClaseDeLicencia

# Valores literales de data-model.md §4.6, usados por los ``CHECK`` de este ``MetaData``. La migración 0001 congela su
# propia copia y ``alembic check`` NO compara ``CHECK``: un test compara los de la base migrada con este diccionario.
DOMINIOS_CERRADOS: Final[dict[str, tuple[str, ...]]] = {
    "source_type": ("guideline", "clinical_trial", "literature", "genomic_study"),
    "language": ("es", "en"),
    "license_class": tuple(clase.value for clase in ClaseDeLicencia),
    "population": ("adulto", "pediatrico", "ambos"),
    "study_design": ("guia", "eca", "observacional", "revision_sistematica", "otro"),
    "trial_phase": ("I", "II", "III", "IV"),
    "metadata_source": ("fuente_estructurada", "extraido_verificado"),
    "original_format": ("jats_xml", "xml", "pdf", "html"),
    "status": ("pendiente", "normalizado", "embebido", "error", "rechazado_licencia"),
}

metadata = sa.MetaData(schema=SCHEMA_CORPUS)


def _check_de_dominio(columna: str) -> sa.CheckConstraint:
    valores = ", ".join(f"'{valor}'" for valor in DOMINIOS_CERRADOS[columna])
    return sa.CheckConstraint(f"{columna} IN ({valores})", name=f"ck_corpus_document_{columna}")


def _texto(nombre: str, *, nullable: bool = False, primary_key: bool = False) -> sa.Column:
    return sa.Column(nombre, sa.Text, nullable=nullable, primary_key=primary_key)


corpus_document = sa.Table(
    "corpus_document",
    metadata,
    _texto("document_id", primary_key=True),
    _texto("source_type"),
    _texto("source_name"),
    _texto("external_id"),
    _texto("title"),
    _texto("language"),
    _texto("license"),
    _texto("license_class"),
    _texto("license_url"),
    sa.Column("open_access", sa.Boolean, nullable=False),
    _texto("cancer_type_tags"),
    _texto("population"),
    _texto("study_design"),
    _texto("trial_phase", nullable=True),
    _texto("primary_endpoint", nullable=True),
    sa.Column("sample_size", sa.Integer, nullable=True),
    sa.Column("population_criteria", postgresql.JSONB, nullable=False),
    _texto("metadata_source"),
    _texto("guideline_version", nullable=True),
    sa.Column("last_updated_at", sa.Date, nullable=True),
    _texto("original_format"),
    _texto("object_key_raw"),
    _texto("object_key_normalized"),
    _texto("checksum"),
    _texto("version_group_id"),
    _texto("version_label"),
    sa.Column("is_current", sa.Boolean, nullable=False),
    sa.Column("superseded_at", sa.DateTime(timezone=True), nullable=True),
    sa.Column("published_at", sa.Date, nullable=False),
    sa.Column("ingested_at", sa.DateTime(timezone=True), nullable=False),
    sa.Column("last_checked_at", sa.DateTime(timezone=True), nullable=False),
    _texto("status"),
    *(_check_de_dominio(columna) for columna in DOMINIOS_CERRADOS),
)

corpus_release = sa.Table(
    "corpus_release",
    metadata,
    _texto("release_id", primary_key=True),
    sa.Column("cutoff_date", sa.Date, nullable=False),
    sa.Column("document_count", sa.Integer, nullable=False),
    _texto("excluded_sources"),
    sa.Column("published_at", sa.DateTime(timezone=True), nullable=False),
)

corpus_release_document = sa.Table(
    "corpus_release_document",
    metadata,
    _texto("release_id", primary_key=True),
    _texto("document_id", primary_key=True),
)
