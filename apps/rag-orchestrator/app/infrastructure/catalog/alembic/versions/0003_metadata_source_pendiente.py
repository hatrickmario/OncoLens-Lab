"""corpus_document.metadata_source admite ``pendiente`` (US-118, D6, ``[S3 resp. 16]``).

``pendiente`` = la extracción de metadatos no corrió (LLM o NLI caídos, o salida inválida): nunca se rotula
``fuente_estructurada``, porque la fuente no publicó nada (RN-25). El ``downgrade`` restaura el ``CHECK`` anterior y
falla con un mensaje explícito si quedan filas ``pendiente``: nunca reescribe datos.

Revision ID: 0003_metadata_source_pendiente
Revises: 0002_corpus_document_source_url
"""

from alembic import op

revision = "0003_metadata_source_pendiente"
down_revision = "0002_corpus_document_source_url"
branch_labels = None
depends_on = None

SCHEMA = "corpus"
RESTRICCION = "ck_corpus_document_metadata_source"
# Copia congelada en esta revisión (una migración no sigue a ``tables.py``).
ANTES = ("fuente_estructurada", "extraido_verificado")
DESPUES = (*ANTES, "pendiente")


def _lista(valores: tuple[str, ...]) -> str:
    return ", ".join(f"'{valor}'" for valor in valores)


def _reemplazar_restriccion(valores: tuple[str, ...]) -> None:
    op.drop_constraint(RESTRICCION, "corpus_document", schema=SCHEMA, type_="check")
    op.create_check_constraint(
        RESTRICCION, "corpus_document", f"metadata_source IN ({_lista(valores)})", schema=SCHEMA
    )


def upgrade() -> None:
    _reemplazar_restriccion(DESPUES)


def downgrade() -> None:
    quedan = (
        op.get_bind()
        .exec_driver_sql(
            f"SELECT count(*) FROM {SCHEMA}.corpus_document WHERE metadata_source = 'pendiente'"
        )
        .scalar_one()
    )
    if quedan:
        raise RuntimeError(
            f"no se puede volver a 0002: {quedan} documento(s) con metadata_source = 'pendiente'; "
            "la migración no reescribe datos"
        )
    _reemplazar_restriccion(ANTES)
