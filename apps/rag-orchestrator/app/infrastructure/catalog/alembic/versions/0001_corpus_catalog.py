"""Catálogo del corpus: corpus_document, corpus_release y corpus_release_document (US-058, data-model §4.6).

Revision ID: 0001_corpus_catalog
Revises:
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0001_corpus_catalog"
down_revision = None
branch_labels = None
depends_on = None

SCHEMA = "corpus"

# Congelado en esta revisión (una migración no sigue a ``tables.py``; ``alembic check`` detecta la deriva de columnas).
DOMINIOS = {
    "source_type": ("guideline", "clinical_trial", "literature", "genomic_study"),
    "language": ("es", "en"),
    "license_class": ("dominio_publico", "cc_by", "cc_by_sa", "cc_by_nc"),
    "population": ("adulto", "pediatrico", "ambos"),
    "study_design": ("guia", "eca", "observacional", "revision_sistematica", "otro"),
    "trial_phase": ("I", "II", "III", "IV"),
    "metadata_source": ("fuente_estructurada", "extraido_verificado"),
    "original_format": ("jats_xml", "xml", "pdf", "html"),
    "status": ("pendiente", "normalizado", "embebido", "error", "rechazado_licencia"),
}


def _texto(nombre: str, *, nullable: bool = False, primary_key: bool = False) -> sa.Column:
    return sa.Column(nombre, sa.Text, nullable=nullable, primary_key=primary_key)


def _check(columna: str) -> sa.CheckConstraint:
    valores = ", ".join(f"'{v}'" for v in DOMINIOS[columna])
    return sa.CheckConstraint(f"{columna} IN ({valores})", name=f"ck_corpus_document_{columna}")


def upgrade() -> None:
    # Primero los privilegios por defecto [S1 resp. 14b]: el migrator es dueño de lo que crea y el runtime
    # ``rag_corpus`` recibe solo DML (y uso de secuencias) sobre ello; nunca CREATE.
    op.execute(
        f"ALTER DEFAULT PRIVILEGES IN SCHEMA {SCHEMA} "
        "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO rag_corpus"
    )
    op.execute(
        f"ALTER DEFAULT PRIVILEGES IN SCHEMA {SCHEMA} GRANT USAGE, SELECT ON SEQUENCES TO rag_corpus"
    )

    op.create_table(
        "corpus_document",
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
        *(_check(columna) for columna in DOMINIOS),
        schema=SCHEMA,
    )
    op.create_table(
        "corpus_release",
        _texto("release_id", primary_key=True),
        sa.Column("cutoff_date", sa.Date, nullable=False),
        sa.Column("document_count", sa.Integer, nullable=False),
        _texto("excluded_sources"),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=False),
        schema=SCHEMA,
    )
    op.create_table(
        "corpus_release_document",
        _texto("release_id", primary_key=True),
        _texto("document_id", primary_key=True),
        schema=SCHEMA,
    )


def downgrade() -> None:
    op.drop_table("corpus_release_document", schema=SCHEMA)
    op.drop_table("corpus_release", schema=SCHEMA)
    op.drop_table("corpus_document", schema=SCHEMA)
    op.execute(
        f"ALTER DEFAULT PRIVILEGES IN SCHEMA {SCHEMA} "
        "REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM rag_corpus"
    )
    op.execute(
        f"ALTER DEFAULT PRIVILEGES IN SCHEMA {SCHEMA} REVOKE USAGE, SELECT ON SEQUENCES FROM rag_corpus"
    )
