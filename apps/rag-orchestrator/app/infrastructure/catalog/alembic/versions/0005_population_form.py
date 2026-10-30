"""``corpus_document.population_form``: la forma de ``population_criteria`` por documento (US-241, ADR-47, design D4).

``antigua`` = un valor por criterio (cadena o ``{valor, alcance}``); ``lista`` = por criterio una lista acotada de
``{value, chunkId, scope, promptVersion, modelVersion, catalogVersion, nliResult}`` o la marca ``pendiente``. La migración
no reescribe ninguna fila (P1): las existentes quedan ``antigua`` con su ``population_criteria`` intacto y el lector las
proyecta. El ``downgrade`` elimina la columna sin tocar datos.

Revision ID: 0005_population_form
Revises: 0004_extracted_fields
"""

import sqlalchemy as sa
from alembic import op

revision = "0005_population_form"
down_revision = "0004_extracted_fields"
branch_labels = None
depends_on = None

SCHEMA = "corpus"
RESTRICCION = "ck_corpus_document_population_form"
# Copia congelada en esta revisión (una migración no sigue a ``tables.py``).
FORMAS = ("antigua", "lista")


def upgrade() -> None:
    op.add_column(
        "corpus_document",
        sa.Column("population_form", sa.Text, nullable=False, server_default="antigua"),
        schema=SCHEMA,
    )
    valores = ", ".join(f"'{forma}'" for forma in FORMAS)
    op.create_check_constraint(
        RESTRICCION, "corpus_document", f"population_form IN ({valores})", schema=SCHEMA
    )


def downgrade() -> None:
    op.drop_constraint(RESTRICCION, "corpus_document", schema=SCHEMA, type_="check")
    op.drop_column("corpus_document", "population_form", schema=SCHEMA)
