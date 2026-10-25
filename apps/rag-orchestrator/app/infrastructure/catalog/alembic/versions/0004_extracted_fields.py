"""``corpus_document.extracted_fields``: qué campos extrajo el LLM y verificó el NLI (US-118/US-117, M-08.4).

Distingue lo extraído de lo declarado por el manifiesto: la muestra de revisión humana solo toma los campos listados
aquí. Las filas existentes quedan con ``[]`` (nada se infiere hacia atrás). El ``downgrade`` elimina la columna.

Revision ID: 0004_extracted_fields
Revises: 0003_metadata_source_pendiente
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0004_extracted_fields"
down_revision = "0003_metadata_source_pendiente"
branch_labels = None
depends_on = None

SCHEMA = "corpus"


def upgrade() -> None:
    op.add_column(
        "corpus_document",
        sa.Column(
            "extracted_fields",
            postgresql.JSONB,
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        schema=SCHEMA,
    )


def downgrade() -> None:
    op.drop_column("corpus_document", "extracted_fields", schema=SCHEMA)
