"""``alembic upgrade head`` como ``rag_corpus_migrator`` (US-058, D6): lo ejecuta el *one-shot* ``corpus-migrate``.

    python -m app.scripts.migrate_corpus_catalog

Salida: solo la revisión y el resultado; nunca credenciales, URLs ni contenido. Código 0 si el catálogo queda en ``head``.
"""

from __future__ import annotations

import sys
from pathlib import Path

from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from pydantic import ValidationError
from sqlalchemy.engine import URL
from sqlalchemy.exc import DBAPIError

from app.infrastructure.catalog.conexion import SecretoIlegible, url_del_migrador_desde_el_entorno

DIRECTORIO_ALEMBIC = (
    Path(__file__).resolve().parent.parent / "infrastructure" / "catalog" / "alembic"
)


def configuracion_de_alembic(url: URL) -> Config:
    """Configuración en memoria: la URL (con la contraseña) viaja en ``attributes``, no en un archivo ni en un log."""
    config = Config()
    config.set_main_option("script_location", str(DIRECTORIO_ALEMBIC))
    config.attributes["url"] = url
    return config


def revision_head() -> str:
    return (
        ScriptDirectory.from_config(
            configuracion_de_alembic(URL.create("postgresql"))
        ).get_current_head()
        or ""
    )


def migrar(url: URL) -> str:
    """Aplica las revisiones pendientes y devuelve el identificador de ``head``."""
    command.upgrade(configuracion_de_alembic(url), "head")
    return revision_head()


def _describir_fallo(error: Exception) -> str:
    if isinstance(error, ValidationError):
        return "configuración inválida en: " + ", ".join(
            str(e["loc"][0]).upper() for e in error.errors()
        )
    if isinstance(error, DBAPIError):
        return f"{type(error.orig).__name__}: {str(error.orig).splitlines()[0]}"
    return type(error).__name__ if not isinstance(error, SecretoIlegible) else str(error)


def main() -> int:
    try:
        cabeza = migrar(url_del_migrador_desde_el_entorno())
    except Exception as error:  # noqa: BLE001 - se informa la clase y una línea sin credenciales
        print(f"corpus-migrate: falló ({_describir_fallo(error)})", file=sys.stderr)
        return 1
    print(f"corpus-migrate: catálogo del corpus en la revisión {cabeza}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
