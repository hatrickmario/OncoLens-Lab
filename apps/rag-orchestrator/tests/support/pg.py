"""Arnés de PostgreSQL real de test para rag-orchestrator (US-058 D7, [S1 resp. 14b]).

Contrato de L1D-165/L1D-168: entra como ``oncolens_test_admin`` (solo ``CREATEDB``; el superusuario no tiene regla de
red), crea una base ``${PG_TEST_DB_PREFIX}<id>`` por ejecución con el schema ``corpus`` vacío, aplica
``corpus-schema-grants.sql``, migra con Alembic como ``rag_corpus_migrator``, entrega la conexión de runtime como
``rag_corpus`` y elimina la base al terminar. Nunca usa el superusuario.

Debe correr DENTRO de ``corpus-db-net`` (pg_hba admite ``rag_corpus*`` solo desde esa subred). Los mensajes nombran la
variable o la base, jamás una URL de conexión ni una contraseña. El sufijo de la base lo inyecta quien llama.
"""

from __future__ import annotations

import re
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from pathlib import Path

import psycopg
from sqlalchemy.engine import URL, make_url
from sqlalchemy.exc import ArgumentError

from app.config.settings import ROL_MIGRADOR_CORPUS, ROL_RUNTIME_CORPUS
from app.infrastructure.catalog.conexion import DRIVER, leer_secreto
from app.scripts.migrate_corpus_catalog import migrar
from tests.support.contract import RAIZ_REPOSITORIO

# Misma regla que scripts/lib/pg-test-prefix.sh. Un cambio allí obliga a cambiar este archivo en el mismo PR.
PATRON_PREFIJO_TEST_DB = re.compile(r"[a-z][a-z0-9_]{2,}")
PATRON_NOMBRE_BASE_TEST = re.compile(r"[a-z][a-z0-9_]*")
BASES_RESERVADAS = ("postgres", "template0", "template1")
PREFIJOS_PROHIBIDOS = ("postgres", "template")
BASE_DE_MANTENIMIENTO = "postgres"
BASE_CLINICA_POR_DEFECTO = "oncolens"
GRANTS_DEL_CORPUS = RAIZ_REPOSITORIO / "infra/docker/postgres/sql/corpus-schema-grants.sql"


class ErrorArnes(RuntimeError):
    """Error del arnés: el mensaje nombra la variable, nunca un valor de conexión."""


def validar_prefijo_test_db(prefijo: str, base_clinica: str) -> None:
    """Aborta sin conectar si el prefijo no cumple la regex o casa con una base que no es de test."""
    if not PATRON_PREFIJO_TEST_DB.fullmatch(prefijo):
        raise ErrorArnes(
            f"PG_TEST_DB_PREFIX no es válido: debe cumplir ^{PATRON_PREFIJO_TEST_DB.pattern}$"
        )
    for reservada in (base_clinica, *BASES_RESERVADAS):
        if reservada.startswith(prefijo):
            raise ErrorArnes(
                "PG_TEST_DB_PREFIX casa con una base que no es de test (la clínica, postgres o template*)"
            )
    if any(prefijo.startswith(prohibido) for prohibido in PREFIJOS_PROHIBIDOS):
        raise ErrorArnes(
            "PG_TEST_DB_PREFIX no puede empezar por postgres ni template (bases reservadas)"
        )


def validar_nombre_base_de_test(nombre: str, prefijo: str, base_clinica: str) -> None:
    """Se llama antes de ``CREATE DATABASE`` y de ``DROP DATABASE``: el arnés no toca una base que no es suya."""
    validar_prefijo_test_db(prefijo, base_clinica)
    valido = (
        PATRON_NOMBRE_BASE_TEST.fullmatch(nombre) is not None
        and nombre.startswith(prefijo)
        and len(nombre) > len(prefijo)
    )
    if not valido or nombre in (base_clinica, *BASES_RESERVADAS):
        raise ErrorArnes(
            "la base de test generada no cumple PG_TEST_DB_PREFIX: el arnés no la crea ni la borra"
        )


@dataclass(frozen=True)
class ConfiguracionArnes:
    url_administracion: URL
    prefijo: str
    base_clinica: str
    archivo_contrasena_runtime: Path
    archivo_contrasena_migrador: Path


def _exigir(entorno: Mapping[str, str], nombre: str) -> str:
    valor = entorno.get(nombre)
    if not valor:
        raise ErrorArnes(
            f"falta la variable {nombre} (perfil test de US-035; ver docs/operations/claves.md)"
        )
    return valor


def leer_configuracion_arnes(entorno: Mapping[str, str]) -> ConfiguracionArnes:
    """Lee y valida el entorno. Aborta antes de conectar si el prefijo o la URL no cumplen."""
    base_clinica = entorno.get("POSTGRES_DB") or BASE_CLINICA_POR_DEFECTO
    prefijo = _exigir(entorno, "PG_TEST_DB_PREFIX")
    validar_prefijo_test_db(prefijo, base_clinica)
    try:
        url = make_url(_exigir(entorno, "TEST_DATABASE_URL"))
    except ArgumentError:
        raise ErrorArnes("TEST_DATABASE_URL no es una URL válida") from None
    if url.query.get("sslmode") != "require":
        raise ErrorArnes("TEST_DATABASE_URL debe llevar sslmode=require (SEG-08)")
    if url.password is None:
        archivo = Path(_exigir(entorno, "PG_TEST_ADMIN_PASSWORD_FILE"))
        url = url.set(password=leer_secreto(archivo, "PG_TEST_ADMIN_PASSWORD_FILE"))
    return ConfiguracionArnes(
        url_administracion=url,
        prefijo=prefijo,
        base_clinica=base_clinica,
        archivo_contrasena_runtime=Path(_exigir(entorno, "PG_RAG_CORPUS_PASSWORD_FILE")),
        archivo_contrasena_migrador=Path(_exigir(entorno, "PG_RAG_CORPUS_MIGRATOR_PASSWORD_FILE")),
    )


def conectar(url: URL) -> psycopg.Connection:
    """Conexión psycopg en autocommit (``CREATE DATABASE`` no corre en transacción) con TLS obligatorio."""
    return psycopg.connect(
        host=url.host,
        port=url.port or 5432,
        user=url.username,
        password=url.password,
        dbname=url.database,
        sslmode="require",
        autocommit=True,
    )


@dataclass(frozen=True)
class BaseDeTest:
    nombre: str
    url_administracion: URL  # dueño de la base de test: solo para sembrar o consultar
    url_migrador: URL  # rag_corpus_migrator
    url_runtime: URL  # rag_corpus
    destruir: Callable[[], None]


def _aplicar_privilegios_del_corpus(url_base: URL) -> None:
    with conectar(url_base) as cliente:
        cliente.execute("CREATE SCHEMA corpus")  # equivalente al bloque de L1D-168; vacío
        cliente.execute(GRANTS_DEL_CORPUS.read_text(encoding="utf-8"))


def crear_base_de_test(
    config: ConfiguracionArnes, sufijo: str, *, migrar_catalogo: bool = True
) -> BaseDeTest:
    """Crea ``${prefijo}${sufijo}``, la migra (salvo ``migrar_catalogo=False``) y devuelve cómo destruirla."""
    nombre = f"{config.prefijo}{sufijo}"
    validar_nombre_base_de_test(nombre, config.prefijo, config.base_clinica)

    admin = config.url_administracion
    with conectar(admin.set(database=BASE_DE_MANTENIMIENTO)) as mantenimiento:
        mantenimiento.execute(f'CREATE DATABASE "{nombre}"')

    def destruir() -> None:
        validar_nombre_base_de_test(nombre, config.prefijo, config.base_clinica)
        with conectar(admin.set(database=BASE_DE_MANTENIMIENTO)) as mantenimiento:
            mantenimiento.execute(f'DROP DATABASE IF EXISTS "{nombre}" WITH (FORCE)')

    url_base = admin.set(database=nombre)
    url_migrador = url_base.set(
        drivername=DRIVER,
        username=ROL_MIGRADOR_CORPUS,
        password=leer_secreto(
            config.archivo_contrasena_migrador, "PG_RAG_CORPUS_MIGRATOR_PASSWORD_FILE"
        ),
    )
    url_runtime = url_base.set(
        drivername=DRIVER,
        username=ROL_RUNTIME_CORPUS,
        password=leer_secreto(config.archivo_contrasena_runtime, "PG_RAG_CORPUS_PASSWORD_FILE"),
    )
    try:
        _aplicar_privilegios_del_corpus(url_base)
        if migrar_catalogo:
            migrar(url_migrador)
    except Exception:
        destruir()
        raise
    return BaseDeTest(nombre, url_base, url_migrador, url_runtime, destruir)
