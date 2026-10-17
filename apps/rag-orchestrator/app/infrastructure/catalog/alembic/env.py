"""Entorno de Alembic del catálogo del corpus (US-058, L1D-114).

Corre como ``rag_corpus_migrator`` (``CORPUS_MIGRATOR_DATABASE_URL`` + ``PG_RAG_CORPUS_MIGRATOR_PASSWORD_FILE``) y
nunca con las credenciales del runtime ``rag_corpus`` [S1 resp. 14b]. Solo ve el schema ``corpus``: la tabla de
versiones vive ahí y ``include_schemas`` filtra cualquier otro schema. Quien invoca (el script del *one-shot* o el
arnés de tests) puede entregar la URL ya compuesta en ``config.attributes["url"]``.
"""

from __future__ import annotations

from alembic import context
from sqlalchemy.engine import URL, Connection

from app.config.settings import SCHEMA_CORPUS, CorpusMigratorSettings
from app.infrastructure.catalog.conexion import componer_url, crear_motor
from app.infrastructure.catalog.tables import metadata

config = context.config


def _url_del_migrador() -> URL:
    entregada = config.attributes.get("url")
    if entregada is not None:
        return entregada
    ajustes = CorpusMigratorSettings(_env_file=None)  # type: ignore[call-arg]
    return componer_url(
        ajustes.corpus_migrator_database_url,
        ajustes.pg_rag_corpus_migrator_password_file,
        "PG_RAG_CORPUS_MIGRATOR_PASSWORD_FILE",
    )


def _solo_el_schema_corpus(nombre: str | None, tipo: str, _padres: dict) -> bool:
    return nombre == SCHEMA_CORPUS if tipo == "schema" else True


def _configurar(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=metadata,
        version_table_schema=SCHEMA_CORPUS,
        include_schemas=True,
        include_name=_solo_el_schema_corpus,
    )


def run_migrations_online() -> None:
    motor = crear_motor(_url_del_migrador(), search_path_corpus=False)
    try:
        with motor.connect() as connection:
            _configurar(connection)
            with context.begin_transaction():
                context.run_migrations()
    finally:
        motor.dispose()


if context.is_offline_mode():
    raise RuntimeError("El catálogo del corpus solo se migra en línea, como rag_corpus_migrator")
run_migrations_online()
