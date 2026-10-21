"""Schemas clínicos SINTÉTICOS en la base de test de rag-orchestrator (US-040, L1D-170).

El arnés de ``pg.py`` solo crea ``corpus``. Para probar el *permission denied* de ``rag_corpus`` se siembra, como el dueño
de la base de test (``oncolens_test_admin``), un schema con una tabla vacía en cada schema clínico (y una en ``public``),
más la precondición hostil: privilegios que darían acceso a los roles del corpus si la migración de privilegios no los
revocara, tanto por schema como globales. Sin datos reales (RN-13); las tablas no tienen filas.
"""

from __future__ import annotations

from psycopg import sql
from sqlalchemy.engine import URL

from app.config.settings import ROL_MIGRADOR_CORPUS, ROL_RUNTIME_CORPUS
from tests.support.contract import RAIZ_REPOSITORIO
from tests.support.pg import conectar

SCHEMAS_CLINICOS = ("auth", "identity", "clinical", "audit", "research")
SCHEMAS_VEDADOS = (*SCHEMAS_CLINICOS, "public")
TABLA_SINTETICA = "tabla_sintetica"
ROLES_DEL_CORPUS = (ROL_RUNTIME_CORPUS, ROL_MIGRADOR_CORPUS)
# Rol que ejecuta la migración de privilegios y por tanto posee los privilegios por defecto: en el arnés es el dueño de la
# base de test; en Compose lo será el rol de migraciones de clinical-api (design D2).
ROL_QUE_MIGRA_CLINICAL = "oncolens_test_admin"
MIGRACION_DE_PRIVILEGIOS = (
    RAIZ_REPOSITORIO
    / "apps/clinical-api/prisma/migrations/20261021120000_privilegios_roles/migration.sql"
)


def _roles() -> sql.Composable:
    return sql.SQL(", ").join(sql.Identifier(rol) for rol in ROLES_DEL_CORPUS)


def sembrar_schemas_clinicos_hostiles(url_administracion: URL) -> None:
    """Crea una tabla sintética por schema vedado y concede a los roles del corpus todo lo que la migración debe revocar."""
    with conectar(url_administracion) as admin:
        for esquema in SCHEMAS_VEDADOS:
            destino = sql.Identifier(esquema)
            if esquema != "public":
                admin.execute(sql.SQL("CREATE SCHEMA {}").format(destino))
            admin.execute(
                sql.SQL("CREATE TABLE {}.{} (id integer)").format(
                    destino, sql.Identifier(TABLA_SINTETICA)
                )
            )
            # la migración concede INSERT al writer sobre esta tabla (ADR-19)
            if esquema == "research":
                admin.execute(
                    sql.SQL("CREATE TABLE {}.episode_snapshot (id integer)").format(destino)
                )
            for instruccion in (
                "GRANT USAGE ON SCHEMA {} TO {}",
                "GRANT SELECT ON ALL TABLES IN SCHEMA {} TO {}",
                "ALTER DEFAULT PRIVILEGES IN SCHEMA {} GRANT SELECT ON TABLES TO {}",
            ):
                admin.execute(sql.SQL(instruccion).format(destino, _roles()))
        # Variante global (sin IN SCHEMA): también debe quedar revocada para las tablas futuras de cualquier schema.
        admin.execute(
            sql.SQL("ALTER DEFAULT PRIVILEGES GRANT SELECT ON TABLES TO {}").format(_roles())
        )


def aplicar_migracion_de_privilegios(url_administracion: URL) -> None:
    """Ejecuta completo el SQL de la migración de clinical-api (puro e idempotente) como el dueño de la base de test."""
    with conectar(url_administracion) as admin:
        admin.execute(MIGRACION_DE_PRIVILEGIOS.read_text(encoding="utf-8"))


def crear_tabla_posterior_a_la_migracion(
    url_administracion: URL, esquema: str, nombre: str, rol_migrador: str
) -> None:
    """Crea la tabla de AC-3 con ``rol_migrador``, el rol que ejecutó la migración y posee sus privilegios por defecto.

    Falla antes de crear si la conexión no es de ese rol: un rol distinto haría vacuo el test (no heredaría los defaults).
    """
    with conectar(url_administracion) as admin:
        actual = admin.execute("SELECT current_user").fetchone()
        assert actual == (rol_migrador,)
        admin.execute(
            sql.SQL("CREATE TABLE {}.{} (id integer)").format(
                sql.Identifier(esquema), sql.Identifier(nombre)
            )
        )
