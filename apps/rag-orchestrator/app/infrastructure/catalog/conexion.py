"""Conexión a PostgreSQL del schema `corpus`: la contraseña sale de un archivo, nunca de la URL ni de un log."""

from __future__ import annotations

from pathlib import Path

from sqlalchemy import Engine, create_engine
from sqlalchemy.engine import URL, make_url

from app.config.settings import SCHEMA_CORPUS, CorpusMigratorSettings

DRIVER = "postgresql+psycopg"


class SecretoIlegible(RuntimeError):
    """El archivo del secreto no existe, no se puede leer o está vacío. El mensaje no incluye su contenido."""


def leer_secreto(archivo: Path, clave: str) -> str:
    try:
        valor = archivo.read_text(encoding="utf-8").rstrip("\r\n")
    except OSError as error:
        raise SecretoIlegible(f"{clave}: no se puede leer el archivo del secreto") from error
    if not valor:
        raise SecretoIlegible(f"{clave}: el archivo del secreto está vacío")
    return valor


def componer_url(url_sin_contrasena: str, archivo_contrasena: Path, clave_archivo: str) -> URL:
    """Une la URL validada por ``Settings`` (sin contraseña) con la contraseña del archivo del secreto."""
    return make_url(url_sin_contrasena).set(
        drivername=DRIVER, password=leer_secreto(archivo_contrasena, clave_archivo)
    )


def url_del_migrador_desde_el_entorno() -> URL:
    """URL de ``rag_corpus_migrator`` con su contraseña del archivo ``PG_RAG_CORPUS_MIGRATOR_PASSWORD_FILE``."""
    ajustes = CorpusMigratorSettings(_env_file=None)  # type: ignore[call-arg]
    return componer_url(
        ajustes.corpus_migrator_database_url,
        ajustes.pg_rag_corpus_migrator_password_file,
        "PG_RAG_CORPUS_MIGRATOR_PASSWORD_FILE",
    )


def crear_motor(url: URL, *, search_path_corpus: bool = True) -> Engine:
    """Motor con ``search_path=corpus``: ningún objeto sin calificar cae fuera del schema del corpus.

    Alembic lo pide sin ``search_path``: con el schema por defecto igual a ``corpus`` su autogeneración (``alembic
    check``) no reconoce las tablas calificadas como ``corpus.*`` y las daría por ausentes. La migración califica
    cada objeto con ``schema="corpus"`` y ``include_schemas`` limita lo que ve a ese schema.
    """
    opciones = {"options": f"-c search_path={SCHEMA_CORPUS}"} if search_path_corpus else {}
    return create_engine(url, connect_args=opciones)
