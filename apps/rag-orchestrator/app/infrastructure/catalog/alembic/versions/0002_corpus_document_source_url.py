"""corpus_document.source_url: URL pública del documento original (ARR-07, data-model §4.6).

Columna nullable: los documentos ya cargados quedan en NULL (la UI muestra "No disponible", RN-25) hasta recargar la
semilla; un documento con el mismo checksum se omite, así que hay que recargar el corpus para poblarla.

Revision ID: 0002_corpus_document_source_url
Revises: 0001_corpus_catalog
"""

import sqlalchemy as sa
from alembic import op

revision = "0002_corpus_document_source_url"
down_revision = "0001_corpus_catalog"
branch_labels = None
depends_on = None

SCHEMA = "corpus"


def upgrade() -> None:
    op.add_column("corpus_document", sa.Column("source_url", sa.Text, nullable=True), schema=SCHEMA)


def downgrade() -> None:
    op.drop_column("corpus_document", "source_url", schema=SCHEMA)
