"""Schemas clínicos SINTÉTICOS en la base de test de rag-orchestrator (US-040, L1D-170).

El arnés de ``pg.py`` solo crea ``corpus``. Para probar el *permission denied* de ``rag_corpus`` se siembra, como el dueño
de la base de test (``oncolens_test_admin``), un schema con una tabla vacía en cada schema clínico, más la precondición
hostil: privilegios que darían acceso a los roles del corpus si la migración de privilegios no los revocara. Sin datos
reales (RN-13); las tablas no tienen filas.
"""

from __future__ import annotations

from sqlalchemy.engine import URL

from app.config.settings import ROL_MIGRADOR_CORPUS, ROL_RUNTIME_CORPUS
from tests.support.contract import RAIZ_REPOSITORIO
from tests.support.pg import conectar

SCHEMAS_CLINICOS = ("auth", "identity", "clinical", "audit", "research")
TABLA_SINTETICA = "tabla_sintetica"
ROLES_DEL_CORPUS = (ROL_RUNTIME_CORPUS, ROL_MIGRADOR_CORPUS)
MIGRACION_DE_PRIVILEGIOS = (
    RAIZ_REPOSITORIO
    / "apps/clinical-api/prisma/migrations/20261021120000_privilegios_roles/migration.sql"
)


def sembrar_schemas_clinicos_hostiles(url_administracion: URL) -> None:
    """Crea una tabla sintética en cada schema clínico y concede a los roles del corpus todo lo que la migración debe revocar."""
    with conectar(url_administracion) as admin:
        for esquema in SCHEMAS_CLINICOS:
            admin.execute(f'CREATE SCHEMA "{esquema}"')
            admin.execute(f'CREATE TABLE "{esquema}"."{TABLA_SINTETICA}" (id integer)')
            for rol in ROLES_DEL_CORPUS:
                admin.execute(f'GRANT USAGE ON SCHEMA "{esquema}" TO "{rol}"')
                admin.execute(f'GRANT SELECT ON ALL TABLES IN SCHEMA "{esquema}" TO "{rol}"')
                admin.execute(
                    f'ALTER DEFAULT PRIVILEGES IN SCHEMA "{esquema}" GRANT SELECT ON TABLES TO "{rol}"'
                )


def crear_tabla_posterior_a_la_migracion(url_administracion: URL, esquema: str, nombre: str) -> None:
    """Tabla creada DESPUÉS de la migración por el rol que migra el esquema clínico (AC-3)."""
    with conectar(url_administracion) as admin:
        admin.execute(f'CREATE TABLE "{esquema}"."{nombre}" (id integer)')
